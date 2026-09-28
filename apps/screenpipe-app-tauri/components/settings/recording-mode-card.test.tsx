// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecordingModeCard } from "./recording-mode-card";
import { recordingPreset } from "./recording-policy";

const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@/lib/api", () => ({ localFetch: fetchStatus }));
vi.mock("gt-react", () => ({ useGT: () => (text: string, vars?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? key)) }));
vi.mock("@/lib/hooks/use-interval", () => ({ useInterval: () => {} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function select(name: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Recording mode" }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name, exact: true }));
}

describe("recording mode consent and runtime state", () => {
  it("previews all preset changes; cancel writes nothing; save submits one complete patch", async () => {
    fetchStatus.mockResolvedValue({ ok: false });
    const change = vi.fn();
    render(<RecordingModeCard settings={{ videoQuality: "high", idleCaptureIntervalMs: 2000, powerMode: "performance" }} onChange={change} onCustomize={() => {}} pending={false} />);
    await waitFor(() => expect(screen.getByText(/status unavailable/)).toBeTruthy());
    select("Low impact");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Image clarity: high → Balanced")).toBeNull();
    expect(screen.getByText(/Image clarity stays as set/)).toBeTruthy();
    expect(screen.getByText("Battery behavior: Ignore battery → Automatic")).toBeTruthy();
    expect(screen.getByText("Idle screenshots: Every 2s → Follow power profile")).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(change).not.toHaveBeenCalled();
    select("Low impact");
    fireEvent.click(screen.getByRole("button", { name: "Save mode" }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith(recordingPreset("low_impact"));
  });
  it("opens Custom without overwriting preferences and can restore Automatic through preview", () => {
    fetchStatus.mockResolvedValue({ ok: false });
    const change = vi.fn(), customize = vi.fn();
    const view = render(<RecordingModeCard settings={recordingPreset("auto")} onChange={change} onCustomize={customize} pending={false} />);
    select("Custom");
    expect(customize).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    view.rerender(<RecordingModeCard settings={{ videoQuality: "high", idleCaptureIntervalMs: 2000 }} onChange={change} onCustomize={customize} pending={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore Automatic" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });
  it("More detail preserves High clarity and stays selected after applying the patch", () => {
    fetchStatus.mockResolvedValue({ ok: false });
    const initial = { recordingDetail: "auto" as const, videoQuality: "high" };
    const change = vi.fn();
    const view = render(<RecordingModeCard settings={initial} onChange={change} onCustomize={() => {}} pending={false} />);
    select("More detail");
    expect(screen.queryByText(/Image clarity:.*Balanced/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save mode" }));
    const patch = change.mock.calls[0][0];
    expect(patch).not.toHaveProperty("videoQuality");
    const applied = { ...initial, ...patch };
    expect(applied.videoQuality).toBe("high");
    view.rerender(<RecordingModeCard settings={applied} onChange={change} onCustomize={() => {}} pending />);
    expect(screen.getByRole("combobox").textContent).toContain("More detail");
  });
  it("keeps saved detail selected while displaying runtime battery interruption and pending changes", async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({ active_profile: "audio_paused", user_pref: "auto", state: { on_ac: false, battery_pct: 15, thermal_state: "nominal" }, recording_detail: { preferred_mode: "more_detail", scroll_interval_ms: 5000, reason: "power" } }) });
    render(<RecordingModeCard settings={recordingPreset("more_detail")} onChange={() => {}} onCustomize={() => {}} pending />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Audio and screenshots paused"));
    expect(screen.getByRole("combobox").textContent).toContain("More detail");
    expect(screen.getByText(/Changes pending/)).toBeTruthy();
  });
  it("handles malformed and older backend responses without crashing", async () => {
    fetchStatus.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<RecordingModeCard settings={recordingPreset("auto")} onChange={() => {}} onCustomize={() => {}} pending={false} />);
    await waitFor(() => expect(screen.getByText(/status unavailable/)).toBeTruthy());
  });
  it("prevents a preset from overwriting managed preferences", () => {
    fetchStatus.mockResolvedValue({ ok: false });
    render(<RecordingModeCard settings={recordingPreset("auto")} onChange={() => {}} onCustomize={() => {}} pending={false} locked />);
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/organization manages/)).toBeTruthy();
  });
});
