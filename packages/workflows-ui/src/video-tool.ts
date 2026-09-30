// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
/** The tool proposes edits; only the mounted video page can persist or render them. */
export type VideoDraft = { version: 1; sourceHash: string; scenes: Array<{ id: string; title: string; narration: string; includeImage: boolean }> };
export type VideoEdit = { changes: Array<{ id: string; title?: string; narration?: string; includeImage?: boolean }>; order?: string[]; render: boolean };
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && [...v].length <= max;
export function parseVideoDraft(value: unknown): VideoDraft {
  if (!record(value) || value.version !== 1 || !text(value.sourceHash, 32) || !Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 50 ||
      value.scenes.some(s => !record(s) || !/^section-\d+$/.test(s.id) || !text(s.title, 140) || !text(s.narration, 18000) || typeof s.includeImage !== "boolean") ||
      new Set(value.scenes.map(s => s.id)).size !== value.scenes.length || value.scenes.reduce((n, s) => n + [...s.narration].length, 0) > 18000) throw new Error("Invalid video draft. Your saved script is unchanged.");
  return { version: 1, sourceHash: value.sourceHash, scenes: value.scenes.map(({ id, title, narration, includeImage }) => ({ id, title, narration, includeImage })) };
}
export function parseVideoEdit(value: unknown): VideoEdit {
  if (!record(value) || Object.keys(value).some(k => !["changes", "order", "render"].includes(k)) || typeof value.render !== "boolean" || !Array.isArray(value.changes) || value.changes.length > 50 ||
      value.changes.some(c => !record(c) || !/^section-\d+$/.test(c.id) || Object.keys(c).some(k => !["id", "title", "narration", "includeImage"].includes(k)) ||
        (c.title !== undefined && !text(c.title, 140)) || (c.narration !== undefined && !text(c.narration, 18000)) || (c.includeImage !== undefined && typeof c.includeImage !== "boolean")) ||
      new Set(value.changes.map(c => c.id)).size !== value.changes.length ||
      (value.order !== undefined && (!Array.isArray(value.order) || !value.order.length || value.order.length > 50 || value.order.some(id => typeof id !== "string" || !/^section-\d+$/.test(id)) || new Set(value.order).size !== value.order.length)))
    throw new Error("Invalid video edit. Your saved script is unchanged.");
  return value as VideoEdit;
}
export function applyVideoEdit(draft: VideoDraft, input: unknown): VideoDraft {
  const edit = parseVideoEdit(input);
  const ids = new Set(draft.scenes.map(s => s.id));
  if ([...edit.changes.map(c => c.id), ...(edit.order ?? [])].some(id => !ids.has(id))) throw new Error("The video edit references an unknown section.");
  const scenes = draft.scenes.map(s => ({ ...s, ...edit.changes.find(c => c.id === s.id) }));
  return parseVideoDraft({ ...draft, scenes: edit.order ? edit.order.map(id => scenes.find(s => s.id === id)!) : scenes });
}
export default function videoTool(pi: any) {
  pi.registerTool({
    name: "edit_video_sop", label: "Edit video SOP",
    description: "Propose one combined patch to the attached video script. Existing section IDs only. Supply order to reorder or omit sections. Render true only when the user explicitly asks to create/regenerate the video. A normal wording edit saves the script without generating speech. No files, media URLs, arbitrary commands or workflow execution. The app validates and saves after the turn; do not claim success yourself.",
    parameters: { type: "object", additionalProperties: false, required: ["changes", "render"], properties: {
      changes: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", pattern: "^section-\\d+$" }, title: { type: "string", minLength: 1, maxLength: 140 }, narration: { type: "string", minLength: 1, maxLength: 18000 }, includeImage: { type: "boolean" } } } },
      order: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: { type: "string" } },
      render: { type: "boolean" },
    } },
    async execute(_id: string, input: unknown) { return { content: [{ type: "text", text: JSON.stringify(parseVideoEdit(input)) }] }; },
  });
}
