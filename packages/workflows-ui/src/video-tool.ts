// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
/** The tool proposes edits; only the mounted video page can persist or render them. */
export type VideoFocus = { x: number; y: number; zoom: number };
export type VideoDraft = { version: 1; sourceHash: string; scenes: Array<{ id: string; title: string; narration: string; includeImage: boolean; pace?: number; focus?: VideoFocus | null }> };
export type VideoEdit = { changes: Array<{ id: string; title?: string; narration?: string; includeImage?: boolean; pace?: number; focus?: VideoFocus | null }>; order?: string[]; render: boolean };
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && [...v].length <= max;
const presentation = (s: Record<string, any>) =>
  (s.pace === undefined || (typeof s.pace === "number" && Number.isFinite(s.pace) && s.pace >= 0.85 && s.pace <= 1.25)) &&
  (s.focus === undefined || s.focus === null || (record(s.focus) && Object.keys(s.focus).every(k => ["x", "y", "zoom"].includes(k)) &&
    [s.focus.x, s.focus.y, s.focus.zoom].every(v => typeof v === "number" && Number.isFinite(v)) &&
    s.focus.x >= 0 && s.focus.x <= 1 && s.focus.y >= 0 && s.focus.y <= 1 && s.focus.zoom >= 1 && s.focus.zoom <= 1.6));
export function parseVideoDraft(value: unknown): VideoDraft {
  if (!record(value) || value.version !== 1 || !text(value.sourceHash, 32) || !Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 50 ||
      value.scenes.some(s => !record(s) || !/^section-\d+$/.test(s.id) || !text(s.title, 140) || !text(s.narration, 18000) || typeof s.includeImage !== "boolean" || !presentation(s)) ||
      new Set(value.scenes.map(s => s.id)).size !== value.scenes.length || value.scenes.reduce((n, s) => n + [...s.narration].length, 0) > 18000) throw new Error("Invalid video draft. Your saved script is unchanged.");
  return { version: 1, sourceHash: value.sourceHash, scenes: value.scenes.map(({ id, title, narration, includeImage, pace, focus }) => ({ id, title, narration, includeImage, ...(pace !== undefined ? { pace } : {}), ...(focus !== undefined ? { focus } : {}) })) };
}
export function parseVideoEdit(value: unknown): VideoEdit {
  if (!record(value) || Object.keys(value).some(k => !["changes", "order", "render"].includes(k)) || typeof value.render !== "boolean" || !Array.isArray(value.changes) || value.changes.length > 50 ||
      value.changes.some(c => !record(c) || !/^section-\d+$/.test(c.id) || Object.keys(c).some(k => !["id", "title", "narration", "includeImage", "pace", "focus"].includes(k)) ||
        (c.title !== undefined && !text(c.title, 140)) || (c.narration !== undefined && !text(c.narration, 18000)) || (c.includeImage !== undefined && typeof c.includeImage !== "boolean") || !presentation(c)) ||
      new Set(value.changes.map(c => c.id)).size !== value.changes.length ||
      (value.order !== undefined && (!Array.isArray(value.order) || !value.order.length || value.order.length > 50 || value.order.some(id => typeof id !== "string" || !/^section-\d+$/.test(id)) || new Set(value.order).size !== value.order.length)))
    throw new Error("Invalid video edit. Your saved script is unchanged.");
  return value as VideoEdit;
}
export function applyVideoEdit(draft: VideoDraft, input: unknown): VideoDraft {
  const edit = parseVideoEdit(input);
  const ids = new Set(draft.scenes.map(s => s.id));
  if ([...edit.changes.map(c => c.id), ...(edit.order ?? [])].some(id => !ids.has(id))) throw new Error("The video edit references an unknown section.");
  const scenes = draft.scenes.map(s => {
    const next = { ...s, ...edit.changes.find(c => c.id === s.id) };
    if (!next.includeImage) next.focus = null;
    return next;
  });
  return parseVideoDraft({ ...draft, scenes: edit.order ? edit.order.map(id => scenes.find(s => s.id === id)!) : scenes });
}
export default function videoTool(pi: any) {
  let read = false;
  const inspected = new Set<string>();
  pi.registerTool({
    name: "read_video_sop", label: "Inspect video project",
    description: "Read the attached video project before editing. With guidance:true, load the video editing skill. With scene_id, inspect that section's actual screenshot. Load images only when needed. A missing screenshot is not visual evidence.",
    parameters: { type: "object", additionalProperties: false, properties: { guidance: { type: "boolean" }, scene_id: { type: "string", pattern: "^section-\\d+$" } } },
    async execute(_id: string, args: { guidance?: boolean; scene_id?: string }, _signal: AbortSignal, _update: unknown, ctx: { cwd: string; model?: { input?: string[] } }) {
      const module = "node:fs/promises";
      const fs = await import(/* @vite-ignore */ module);
      if (args.guidance) return { content: [{ type: "text", text: await fs.readFile(`${ctx.cwd}/.pi/skills/video-sop/SKILL.md`, "utf8") }] };
      const path = `${ctx.cwd}/video-project.json`;
      if ((await fs.stat(path)).size > 100000) throw new Error("Video project is too large.");
      const project = JSON.parse(await fs.readFile(path, "utf8"));
      const draft = parseVideoDraft(project.draft);
      read = true;
      if (!args.scene_id) return { content: [{ type: "text", text: JSON.stringify({ ...draft, screenshots: Object.keys(project.images ?? {}) }) }] };
      if (!/^section-\d+$/.test(args.scene_id) || !draft.scenes.some(s => s.id === args.scene_id)) throw new Error("Unknown video section.");
      const mimeType = project.images?.[args.scene_id];
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return { content: [{ type: "text", text: "No reviewed screenshot is available for this section. Do not invent a visual or focus region." }] };
      if (!ctx.model?.input?.includes("image")) return { content: [{ type: "text", text: "The selected model cannot inspect screenshots. Wording and pacing edits still work. Ask the user to select an image-capable model for visual focus edits; do not switch providers or guess a focus region." }] };
      const image = `${ctx.cwd}/${args.scene_id}.image`;
      if ((await fs.stat(image)).size > 12000000) throw new Error("Screenshot is too large.");
      const data = (await fs.readFile(image)).toString("base64");
      inspected.add(args.scene_id);
      return { content: [{ type: "image", mimeType, data }] };
    },
  });
  pi.registerTool({
    name: "edit_video_sop", label: "Edit video SOP",
    description: "Read the project and video skill with read_video_sop first. Inspect the actual section image before focusing. Pace 0.85–1.25; focus x/y normalized, zoom 1–1.6, null resets. Propose one combined patch to the attached video script. Existing section IDs only. Supply order to reorder or omit sections. Render true only when the user explicitly asks to create/regenerate the video. A normal wording edit saves the script without generating speech. No files, media URLs, arbitrary commands or workflow execution. The app validates and saves after the turn; do not claim success yourself.",
    parameters: { type: "object", additionalProperties: false, required: ["changes", "render"], properties: {
      changes: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", pattern: "^section-\\d+$" }, title: { type: "string", minLength: 1, maxLength: 140 }, narration: { type: "string", minLength: 1, maxLength: 18000 }, includeImage: { type: "boolean" }, pace: { type: "number", minimum: 0.85, maximum: 1.25 }, focus: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["x", "y", "zoom"], properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 }, zoom: { type: "number", minimum: 1, maximum: 1.6 } } }] } } } },
      order: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: { type: "string" } },
      render: { type: "boolean" },
    } },
    async execute(_id: string, input: unknown) {
      if (!read) throw new Error("Read the attached project before editing it.");
      const edit = parseVideoEdit(input);
      if (edit.changes.some(c => c.focus && !inspected.has(c.id))) throw new Error("Inspect each screenshot before choosing its focus.");
      return { content: [{ type: "text", text: JSON.stringify(edit) }] };
    },
  });
}
