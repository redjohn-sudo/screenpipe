// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuideVideoPanel } from "../../../../packages/workflows-ui/src/guide-video-panel";
import { guideVideoScenes, type GuideVideoPlatform } from "../../../../packages/workflows-ui/src/guide-video";
import type { WorkflowGuide } from "../../../../packages/workflows-ui/src/guide";
import { fixtureWorkflowAnalysis } from "../../../../packages/workflows-ui/src/fixture-platform";

const workflow = structuredClone(fixtureWorkflowAnalysis.analysis.workflows[0]);
workflow.id = "example"; workflow.revision = 2;
workflow.stages[0].screenshot = { frameId: 5, timestamp: "2026-09-01T10:00:00Z", app: "Docs", visualVerified: true, matchDistanceSeconds: 0, dataUrl: "" };
const guide: WorkflowGuide = { version: 1, workflowKey: "example", sourceRevision: 2, title: "Review a brief", summary: "Prepare a sourced brief.",
  prerequisites: ["Collect the source documents."], steps: [{ title: "Review sources", instruction: "Check each claim.", expectedResult: "Each claim has a source.", sourceStage: 0, includeImage: true }],
  exceptions: ["Flag conflicting claims."], completion: ["The reviewer has approved the brief."], questions: ["Who approves the brief?"] };
const result = { url: "asset://example/video.mp4", path: "/example/video.mp4", captionsPath: "/example/captions.vtt" };
function platform(): GuideVideoPlatform { return { generate: vi.fn().mockResolvedValue(result), release: vi.fn().mockResolvedValue(undefined), export: vi.fn().mockResolvedValue(true) }; }
afterEach(cleanup);
describe("video SOP plans", () => {
  it("preserves all SOP sections and resolves reviewed reference-only screenshots", () => {
    const scenes = guideVideoScenes(guide, workflow);
    expect(scenes).toHaveLength(6);
    expect(scenes[2]).toMatchObject({ image: null, imageFrameId: 5, narration: "Check each claim.\nExpected result: Each claim has a source." });
    for (const text of [...guide.prerequisites, ...guide.exceptions, ...guide.completion, ...guide.questions]) expect(scenes.some(s => s.narration.includes(text))).toBe(true);
  });
  it("never uses unreviewed images or stale source revisions", () => {
    const unreviewed = structuredClone(workflow);
    unreviewed.stages[0].screenshot!.visualVerified = false;
    expect(guideVideoScenes(guide, unreviewed)[2].imageFrameId).toBeUndefined();
    const reviewed = structuredClone(guide);
    reviewed.steps[0].imageReview = { frameId: 5, timestamp: "2026-09-01T10:00:00Z" };
    expect(guideVideoScenes(reviewed, unreviewed)[2].imageFrameId).toBe(5);
    reviewed.steps[0].imageReview.timestamp = "2026-09-02T10:00:00Z";
    expect(guideVideoScenes(reviewed, unreviewed)[2].imageFrameId).toBeUndefined();
    expect(() => guideVideoScenes({ ...guide, sourceRevision: 1 }, workflow)).toThrow(/updated workflow/);
  });
  it("supports explicit text-only export and rejects oversized plans without truncating", () => {
    expect(guideVideoScenes(guide, workflow, false).every(s => !s.image && !s.imageFrameId)).toBe(true);
    expect(() => guideVideoScenes({ ...guide, summary: "a".repeat(18001) }, workflow)).toThrow(/too long/);
    const unicode = { ...guide, summary: "界😀".repeat(200) };
    expect(guideVideoScenes(unicode, workflow)[0].narration).toBe(unicode.summary);
    const edited = structuredClone(guide);
    edited.steps[0].narration = "Outdated narration from an earlier version";
    expect(guideVideoScenes(edited, workflow)[2].narration).toContain(edited.steps[0].instruction);
    expect(guideVideoScenes(edited, workflow)[2].narration).not.toContain("Outdated");
    expect(() => guideVideoScenes({ ...guide, workflowKey: "another" }, workflow)).toThrow(/this workflow/);
    edited.steps[0].instruction = " ";
    expect(() => guideVideoScenes(edited, workflow)).toThrow(/every SOP step/);
  });
});
describe("video SOP review", () => {
  it("does not start until requested, saves first and downloads only on click", async () => {
    const p = platform(), save = vi.fn().mockResolvedValue(undefined);
    render(<GuideVideoPanel guide={guide} workflow={workflow} platform={p} save={save} />);
    expect(p.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Video SOP" }));
    expect(screen.getByText(/Narration is sent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create video" }));
    await screen.findByLabelText("Narrated SOP preview");
    expect(save).toHaveBeenCalledWith(guide);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(p.generate).mock.invocationCallOrder[0]);
    expect(p.export).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download MP4" }));
    await waitFor(() => expect(p.export).toHaveBeenCalledWith(result, guide.title, false));
  });
  it("prevents double submissions and cancels active generation when leaving", async () => {
    const p = platform(); let signal: AbortSignal | undefined;
    vi.mocked(p.generate).mockImplementation(async (_scenes, s) => { signal = s; return new Promise(() => {}); });
    const view = render(<GuideVideoPanel guide={guide} workflow={workflow} platform={p} save={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Video SOP" }));
    fireEvent.click(screen.getByRole("button", { name: "Create video" }));
    fireEvent.click(screen.getByRole("button", { name: "Create video" }));
    await waitFor(() => expect(p.generate).toHaveBeenCalledTimes(1));
    view.unmount(); expect(signal?.aborted).toBe(true);
  });
  it("preserves an earlier preview when replacement fails and flags subsequent edits", async () => {
    const p = platform(), save = async () => {};
    const view = render(<GuideVideoPanel guide={guide} workflow={workflow} platform={p} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Video SOP" }));
    fireEvent.click(screen.getByRole("button", { name: "Create video" }));
    await screen.findByLabelText("Narrated SOP preview");
    view.rerender(<GuideVideoPanel guide={{ ...guide, summary: "Updated instructions" }} workflow={workflow} platform={p} save={save} />);
    expect(screen.getByText(/earlier edit/)).toBeTruthy();
    vi.mocked(p.generate).mockImplementationOnce(async (_scenes, _signal, progress) => {
      progress("Narrating 2 of 8");
      throw new Error("Speech unavailable");
    });
    fireEvent.click(screen.getByRole("button", { name: "Create new video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Speech unavailable");
    expect(screen.queryByText("Narrating 2 of 8")).toBeNull();
    expect(screen.getByLabelText("Narrated SOP preview")).toBeTruthy();
    expect(p.release).not.toHaveBeenCalled();
    view.unmount(); expect(p.release).toHaveBeenCalledWith(result);
  });
  it("does not render on save failure, and releases a late result after cancellation", async () => {
    const p = platform(); const save = vi.fn().mockRejectedValueOnce(new Error("Disk full"));
    render(<GuideVideoPanel guide={guide} workflow={workflow} platform={p} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Video SOP" }));
    fireEvent.click(screen.getByRole("button", { name: "Create video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(p.generate).not.toHaveBeenCalled();
    save.mockResolvedValue(undefined);
    let resolve!: (value: typeof result) => void;
    vi.mocked(p.generate).mockImplementation(() => new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(p.generate).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => resolve(result));
    expect(p.release).toHaveBeenCalledWith(result);
    expect(screen.queryByLabelText("Narrated SOP preview")).toBeNull();
  });
});

it("renders the current chat-supplied script through the same preview controller", async () => {
  const p = platform(); const ref = React.createRef<import("../../../../packages/workflows-ui/src/guide-video-panel").GuideVideoHandle>();
  const { guideVideoDraft } = await import("../../../../packages/workflows-ui/src/guide-video");
  const video = guideVideoDraft(guide, workflow); video.scenes[0].narration = "Chat-edited narration.";
  const edited = { ...guide, video };
  render(<GuideVideoPanel ref={ref} guide={edited} workflow={workflow} platform={p} save={async()=>{}} />);
  await act(async()=>{await ref.current!.generate(edited,new AbortController().signal,()=>{});});
  expect(vi.mocked(p.generate).mock.calls[0][0][0].narration).toBe("Chat-edited narration.");
  expect(screen.getByLabelText("Narrated SOP preview")).toBeTruthy();
  expect(screen.queryByText(/earlier edit/)).toBeNull();
});
