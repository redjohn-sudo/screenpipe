// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { copyFile } from "@tauri-apps/plugin-fs";
import posthog from "posthog-js";
import { commands } from "@/lib/utils/tauri";
import type { GuideVideoPlatform, GuideVideoResult } from "@screenpipe/workflows-ui";
import { findWorkflowScreenshot } from "./source-screenshot";
import { loadOriginalWorkflowScreenshot } from "./original-screenshot";

export async function loadVideoScreenshot(frameId: number, signal: AbortSignal): Promise<string> {
  const blob = await loadOriginalWorkflowScreenshot(frameId, signal);
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the screenshot."));
    reader.readAsDataURL(blob);
  });
  signal.throwIfAborted();
  return result;
}

const ids = new WeakMap<GuideVideoResult, string>();
export const desktopGuideVideo: GuideVideoPlatform = {
  async generate(scenes, signal, progress) {
    signal.throwIfAborted();
    const id = crypto.randomUUID();
    let registered = false;
    const stop = () => { if (registered) void commands.cancelWorkflowVideo(id).catch(() => {}); };
    const unlisten = await listen<string>(`workflow-video-${id}`, event => {
      registered = true;
      if (signal.aborted) stop(); else progress(event.payload);
    });
    signal.addEventListener("abort", stop, { once: true });
    try {
      signal.throwIfAborted();
      progress("Loading screenshots");
      const images = new Map<number, string>();
      const prepared = [];
      for (const scene of scenes) {
        signal.throwIfAborted();
        let frameId = scene.imageFrameId;
        if (!frameId && scene.imageSources?.length) {
          for (const source of scene.imageSources.slice(0, 3)) {
            const frame = await findWorkflowScreenshot(source.timestamp, source.app, signal);
            if (frame) { frameId = frame.frameId; break; }
          }
          if (!frameId) throw new Error(`The recording for “${scene.title}” is unavailable. Choose another screenshot before creating the video.`);
        }
        if (frameId && !images.has(frameId)) images.set(frameId, await loadVideoScreenshot(frameId, signal));
        prepared.push({ title: scene.title, narration: scene.narration, image: images.get(frameId ?? 0) || scene.image || null, pace: scene.pace ?? 1, focus: scene.focus ?? null });
      }
      signal.throwIfAborted();
      posthog.capture("workflow_video_started", { sections: scenes.length, screenshots: prepared.filter(s => s.image).length });
      const output = await commands.createWorkflowVideo(id, prepared);
      if (output.status === "error") throw new Error(output.error);
      if (signal.aborted) {
        await commands.discardWorkflowVideo(id);
        signal.throwIfAborted();
      }
      const result = { ...output.data, url: convertFileSrc(output.data.path), captionsUrl: convertFileSrc(output.data.captionsPath) };
      ids.set(result, id);
      posthog.capture("workflow_video_completed", { sections: scenes.length });
      return result;
    } catch (error) {
      posthog.capture(signal.aborted ? "workflow_video_cancelled" : "workflow_video_failed");
      throw error;
    } finally {
      signal.removeEventListener("abort", stop);
      unlisten();
    }
  },
  async export(result, title, captions) {
    const extension = captions ? "vtt" : "mp4";
    const path = await save({
      defaultPath: `${title.replace(/[^a-zA-Z0-9 -]/g, "").slice(0, 80) || "video-sop"}.${extension}`,
      filters: [{ name: captions ? "WebVTT captions" : "MP4 video", extensions: [extension] }],
    });
    if (!path) return false;
    await copyFile(captions ? result.captionsPath : result.path, path);
    posthog.capture("workflow_video_downloaded", { format: extension });
    return true;
  },
  async release(result) {
    const id = ids.get(result);
    if (!id) return;
    const response = await commands.discardWorkflowVideo(id);
    if (response.status === "error") throw new Error(response.error);
    ids.delete(result);
  },
};
