// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useContext, useEffect, useRef } from "react";
import { guideVideoDraft } from "./guide-video";
import type { WorkflowGuide } from "./guide";
import type { WorkflowMap } from "./model";
import type { WorkflowsPlatform } from "./platform";
import { PageAssistantContext } from "./page-assistant";
import { useGT } from "gt-react";

/** Routes SOP edits through the shell's chat, including history, dictation and stop. */
export function GuideAssistant(props: {
  guide: WorkflowGuide | null;
  videoMode?: boolean;
  renderVideo?: (guide: WorkflowGuide, signal: AbortSignal, progress: (text: string) => void) => Promise<void>;
  promptRequest?: { id: string; text: string };
  workflow: WorkflowMap;
  platform: NonNullable<WorkflowsPlatform["guides"]>;
  update: (guide: WorkflowGuide) => Promise<void>;
}) {
  const ui = useGT();
  const register = useContext(PageAssistantContext);
  const current = useRef(props);
  const unsaved = useRef<WorkflowGuide | null>(null);
  current.current = props;
  useEffect(() => {
    if (!register) return;
    const lifetime = new AbortController();
    register({
      context: {
        key: `${props.videoMode ? "video" : "sop"}:${props.workflow.id || props.workflow.title}`,
        title: ui(props.videoMode ? "Video: {value1}" : "SOP: {value1}", {
          value1: props.guide?.title ?? props.workflow.title,
        }),
        purpose: props.videoMode ? "video" : "sop",
      },
      promptRequest: props.promptRequest,
      ask: async ({ question, signal, onProgress, history }) => {
        const { guide, workflow, platform, update } = current.current;
        if (guide && !current.current.videoMode && !platform.edit)
          throw new Error("SOP editing is unavailable.");
        const run = new AbortController();
        const abort = () => run.abort();
        signal.addEventListener("abort", abort, { once: true });
        lifetime.signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted || lifetime.signal.aborted) abort();
        const runSignal = run.signal;
        try {
          runSignal.throwIfAborted();
          const progress = (text: string) => {
            if (!runSignal.aborted) onProgress({ text, activity: "writing" });
          };
          if (current.current.videoMode && guide) {
            if (!platform.video?.edit) throw new Error("Video editing is unavailable.");
            const response = await platform.video.edit(guideVideoDraft(guide, workflow), question, history, runSignal, progress);
            runSignal.throwIfAborted();
            if (current.current.guide !== guide) throw new Error("The SOP or video script changed while the assistant was editing. Your edits were kept. Try again.");
            const next = { ...guide, video: response.draft };
            if (response.changed || response.render) await update(next);
            runSignal.throwIfAborted();
            if (response.render) {
              if (!current.current.renderVideo) throw new Error("Video rendering is unavailable.");
              await current.current.renderVideo(next, runSignal, progress);
              return "Created the updated video. Review it in the Video SOP preview.";
            }
            return response.changed ? "Saved the video script. Ask me to create the video when you are ready, or choose Create video in the preview." : response.message || "The video script is unchanged.";
          }
          const next = guide
            ? await platform.edit!(
                guide,
                workflow,
                question,
                runSignal,
                progress,
              )
            : (unsaved.current ??
              (await platform.load(workflow)) ??
              (await platform.generate(workflow, runSignal, progress)));
          runSignal.throwIfAborted();
          if (current.current.guide !== guide)
            throw new Error(
              "The SOP changed while the assistant was editing. Your edits were kept. Try again.",
            );
          unsaved.current = next;
          await update(next);
          unsaved.current = null;
          return guide
            ? "Saved the updated SOP. Review the changes on the page."
            : "Saved your SOP on this device. Review its steps on the page.";
        } finally {
          signal.removeEventListener("abort", abort);
          lifetime.signal.removeEventListener("abort", abort);
        }
      },
    });
    return () => {
      lifetime.abort();
      register(null);
    };
  }, [register, props.workflow.id, props.workflow.title, props.videoMode]);
  return null;
}
