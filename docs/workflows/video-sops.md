<!-- screenpipe — AI that knows everything you've seen, said, or heard -->
<!-- https://screenpipe.com -->
# Desktop video SOPs

Open a workflow, choose **Create SOP**, then **Video SOP**. Review the narration and choose whether to include reviewed screenshots before creating the video. Download the MP4 and WebVTT captions before leaving the SOP. Editing the SOP does not change an existing preview; create a new video to include the edits.

The existing AI-generated, editable SOP supplies the initial script. Rendering does not run another agent or execute the workflow. Choose **Edit video in chat** to revise narration or titles, reorder or omit sections, and hide reviewed images through the existing bottom-right chat. Video edits are saved separately inside the SOP file. Normal wording edits save the script; an explicit request to create the video invokes the same renderer. It includes prerequisites, current step instructions, expected results, exceptions, completion checks and unresolved questions. Old hidden step narration fields cannot override an edited SOP instruction. Explicit video edits use a validated `edit_video_sop` patch tool, with only the current text script and six bounded recent messages in context. It has no file, shell, capture or memory tools. Editing the SOP preserves the separate video draft but requires resetting its source before another render. Voice selection and playback-speed changes are not supported. A stale SOP must be reviewed against the current workflow first. The chat shows progress during rendering and minimizes when the finished preview opens; conversation history is preserved.

## Boundaries

- The shared Workflows UI owns the review and progress panel. Its optional platform capability keeps native imports out of web consumers.
- The desktop adapter resolves reviewed frame references through the recorder's existing thumbnail API at 1280px, with neighboring-frame fallback disabled. Missing referenced images stop the request before speech charges; the user can explicitly choose a text-only video. Screenshots are never uploaded.
- Native commands use the existing account token and `/v1/tts` gateway, including Business entitlement and the shared AI allowance. Only narration is sent. There is no new provider key, account, scheduled task or capture pipeline.
- The engine renders a local 720p H.264/AAC MP4 with the bundled FFmpeg. Each caption is timed from its own decoded speech segment. Audio is encoded once to avoid gaps between AAC segments. The final file is decoded before returning success.
- One render runs at a time. Each provider call has a 70-second timeout, each video operation 180 seconds, and the job 25 minutes. Plans are limited to 50 sections, 18,000 characters, 100 speech segments and 20 minutes of output. Encoding uses two threads. Image and output sizes are bounded.
- Stop and navigation cancellation abort pending speech and kill the active renderer. Provider failures are not automatically retried. Account allowance exhaustion has a separate message from transient throttling.
- Temporary source images, speech and video segments are removed after the job. Previews are removed when leaving the SOP or replacing a successful preview. A failed replacement preserves the earlier preview. Abandoned previews are pruned after a day, with a bounded cache. Nothing is added to the workflow catalog or recorder database.
- PostHog records starts, completion, cancellation, failure and explicit downloads, with section/image counts or format only. It receives no workflow identity, script, screenshot, file path or upstream error body.

## Verification

From `apps/screenpipe-app-tauri`:

```sh
bun x vitest run lib/workflows/video-chat.test.tsx lib/workflows/guide-video-edit.test.ts lib/workflows/guide-storage.test.ts lib/workflows/guide-video.test.tsx lib/workflows/guide-video-adapter.test.ts lib/workflows/guide.test.tsx lib/workflows/guides-adapter.test.ts
bun run test:tauri workflow_video -- --nocapture
bun run bindings:check
bun x tsc --noEmit
bun run coverage:all:check
```

The native tests exercise the real bundled renderer, invalid screenshots, caption timing, cancellation, account allowance errors and provider failures without paid calls. The opt-in `workflow_video_live_eval` test takes `SCREENPIPE_VIDEO_EVAL_MANIFEST` (an array of `{directory, scenes}` with local image paths) and `SCREENPIPE_VIDEO_AUTH_FILE`. It uses real speech and must only run with explicit live-evaluation authorization. Keep input and output outside the repository. `workflow_video_recorded_speech_eval` instead accepts `SCREENPIPE_VIDEO_SPEECH_FIXTURE` and uses a local HTTP fixture; it does not prove live narration quality. `workflow_video_replay_eval` accepts `SCREENPIPE_VIDEO_REPLAY_MANIFEST`, an array of `{text, audioPath}` pairs containing previously generated narration, and routes exact text matches to a local fixture server. This reruns the actual renderer without new hosted speech calls.

`bun run eval:workflow-video PRIVATE_WORKFLOWS_JSON PRIVATE_OUTPUT_DIR` evaluates up to twelve real workflow snapshots through the configured SOP model and validates each video plan. Tools are disabled for this evaluation. It does not save or execute user workflows.

For visual review, run `bun run preview:workflow-video OPTIONAL_SYNTHETIC_MP4`. Open the first workflow and its SOP. The `state` query accepts `before`, `review`, `progress`, `error`, `quota`, `cancel`, and `stale`. This renders the actual shared product components with fictional data and mocked host operations. Native IPC, the macOS save dialog, and Windows/Linux playback still need release-platform smoke testing; browser previews do not establish that coverage.
