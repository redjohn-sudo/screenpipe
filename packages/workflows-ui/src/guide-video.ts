// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { guideImage, guideKey, type WorkflowGuide } from "./guide";
import { parseVideoDraft, type VideoDraft } from "./video-tool";
import type { AssistantMessage } from "./assistant";
import type { WorkflowMap } from "./model";
import { stageScreenshots } from "./screenshots";

export type GuideVideoScene = { title: string; narration: string; image: string | null; imageFrameId?: number };
export type GuideVideoResult = { url: string; path: string; captionsPath: string; captionsUrl?: string };
export type GuideVideoPlatform = {
  edit?: (draft: VideoDraft, instruction: string, history: AssistantMessage[], signal: AbortSignal, progress: (message: string) => void) => Promise<{ draft: VideoDraft; render: boolean; message: string; changed: boolean }>;
  generate: (scenes: GuideVideoScene[], signal: AbortSignal, progress: (message: string) => void) => Promise<GuideVideoResult>;
  export: (result: GuideVideoResult, title: string, captions: boolean) => Promise<boolean>;
  release: (result: GuideVideoResult) => Promise<void>;
};

/** Build the initial script from the reviewed SOP before applying explicit video edits. */
function baseGuideVideoScenes(guide: WorkflowGuide, workflow: WorkflowMap): GuideVideoScene[] {
  if (guide.workflowKey !== guideKey(workflow)) throw new Error("Open the SOP for this workflow before creating a video.");
  if (guide.sourceRevision !== (workflow.revision ?? 0))
    throw new Error("Review the updated workflow and refresh this SOP before creating a video.");
  if (guide.steps.some(step => !step.title.trim() || !step.instruction.trim()))
    throw new Error("Add a title and instruction to every SOP step before creating a video.");
  const scenes: GuideVideoScene[] = [];
  const add = (title: string, narration: string, image: string | null = null, imageFrameId?: number) => {
    if (narration.trim()) scenes.push({ title, narration: narration.trim(), image, ...(imageFrameId ? { imageFrameId } : {}) });
  };
  add(guide.title, guide.summary || guide.title);
  add("Before you start", guide.prerequisites.filter(Boolean).join("\n"));
  for (const [index, step] of guide.steps.entries()) {
    const image = step.sourceStage !== null && workflow.stages[step.sourceStage] ? stageScreenshots(workflow.stages[step.sourceStage])[0] : undefined;
    const reviewed = image && (image.visualVerified || (step.imageReview?.frameId === image.frameId && step.imageReview.timestamp === image.timestamp));
    const include = step.includeImage && reviewed;
    const screenshot = include ? guideImage(workflow, step.sourceStage, step.imageReview) : null;
    add(`${index + 1}. ${step.title}`, [step.instruction,
      step.expectedResult && `Expected result: ${step.expectedResult}`].filter(Boolean).join("\n"), screenshot, include && !screenshot ? image.frameId : undefined);
  }
  add("Exceptions", guide.exceptions.filter(Boolean).join("\n"));
  add("Check your result", guide.completion.filter(Boolean).join("\n"));
  add("Questions to resolve", guide.questions.filter(Boolean).join("\n"));
  if (!guide.steps.length || !scenes.length) throw new Error("Add instructions to your SOP first.");
  if (scenes.length > 50 || scenes.some(s => [...s.title].length > 140) ||
      scenes.reduce((count, s) => count + [...s.narration].length, 0) > 18000)
    throw new Error("This SOP is too long for one video. Shorten it or split it into separate SOPs.");
  return scenes;
}

/** A fingerprint detects SOP changes without storing another copy of its text. */
function sourceHash(scenes: GuideVideoScene[]): string {
  let hash = 14695981039346656037n;
  const text = JSON.stringify(scenes.map(({ title, narration, image, imageFrameId }) => ({ title, narration, hasImage: !!image || !!imageFrameId, imageFrameId })));
  for (const char of text) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  return hash.toString(16);
}
export function guideVideoDraft(guide: WorkflowGuide, workflow: WorkflowMap): VideoDraft {
  const base = baseGuideVideoScenes(guide, workflow);
  const hash = sourceHash(base);
  if (guide.video) {
    const draft = parseVideoDraft(guide.video);
    if (draft.sourceHash !== hash || draft.scenes.some(s => !base[Number(s.id.slice(8))]))
      throw new Error("The SOP changed after this video script was edited. Reset the video script to use the current SOP.");
    return draft;
  }
  return { version: 1, sourceHash: hash, scenes: base.map((s, i) => ({ id: `section-${i}`, title: s.title, narration: s.narration, includeImage: !!s.image || !!s.imageFrameId })) };
}
export function guideVideoScenes(guide: WorkflowGuide, workflow: WorkflowMap, includeImages = true): GuideVideoScene[] {
  const base = baseGuideVideoScenes(guide, workflow);
  return guideVideoDraft(guide, workflow).scenes.map(s => {
    const image = includeImages && s.includeImage ? base[Number(s.id.slice(8))] : undefined;
    return { title: s.title, narration: s.narration, image: image?.image ?? null, ...(image?.imageFrameId ? { imageFrameId: image.imageFrameId } : {}) };
  });
}
