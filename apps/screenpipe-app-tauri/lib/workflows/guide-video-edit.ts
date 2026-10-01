// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { videoEditPrompt, applyVideoEdit, parseVideoEdit, type VideoEdit, type GuideVideoPlatform } from "@screenpipe/workflows-ui";
import { runWorkflowAgent } from "./agent-runner";
import { stageVideoProject } from "./video-project";
import { assistantProviderConfig } from "./assistant";

export const editGuideVideo: NonNullable<GuideVideoPlatform["edit"]> = async (draft, instruction, history, signal, progress, scenes = []) => {
  let patch: VideoEdit | null = null;
  // The project is read on demand. The initial prompt contains only the request and bounded conversation.
  const project = await stageVideoProject(draft, scenes, signal);
  try {
  const message = await runWorkflowAgent({
    projectPath: project.path,
    name: "guide", signal, allowEmpty: true,
    config: { ...assistantProviderConfig, maxTokens: 8192, allowedTools: ["read_video_sop", "edit_video_sop"] },
    prompt: videoEditPrompt(instruction, history),
    onProgress: ({ text }) => { if (text) progress(text); },

    onEvent: event => {
      if (event.type === "tool_execution_start") {
        progress(event.toolName === "read_video_sop" ? "Reading the video project" : "Updating the video script");
      }
      if (event.type !== "tool_execution_end" || event.toolName !== "edit_video_sop" || event.isError) return;
      if (patch) throw new Error("Use one combined video edit per answer.");
      patch = parseVideoEdit(JSON.parse(event.result?.content?.find(part => typeof part.text === "string")?.text || "null"));
    },
  });
  signal.throwIfAborted();
  const edit = patch as VideoEdit | null;
  const next = edit ? applyVideoEdit(draft, edit) : draft;
  const changed = JSON.stringify(next) !== JSON.stringify(draft);
  return { draft: next, changed, render: edit?.render ?? false, message };
  } finally { await project.dispose().catch(() => {}); }
};
