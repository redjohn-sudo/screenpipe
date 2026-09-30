// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { guideImage, guideKey, type WorkflowGuide } from "./guide";
import type { WorkflowMap } from "./model";
import { stageScreenshots } from "./screenshots";

export type GuideVideoScene = { title: string; narration: string; image: string | null; imageFrameId?: number };
export type GuideVideoResult = { url: string; path: string; captionsPath: string; captionsUrl?: string };
export type GuideVideoPlatform = {
  generate: (scenes: GuideVideoScene[], signal: AbortSignal, progress: (message: string) => void) => Promise<GuideVideoResult>;
  export: (result: GuideVideoResult, title: string, captions: boolean) => Promise<boolean>;
  release: (result: GuideVideoResult) => Promise<void>;
};

/** The reviewed SOP is authoritative. No extra model pass may invent or omit steps. */
export function guideVideoScenes(guide: WorkflowGuide, workflow: WorkflowMap, includeImages = true): GuideVideoScene[] {
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
    const include = includeImages && step.includeImage && reviewed;
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
