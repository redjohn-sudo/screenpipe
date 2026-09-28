// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AudioBatteryPolicy, BatterySaverSection } from "./battery-saver-section";
const { settings } = vi.hoisted(() => ({ settings: { powerMode: "auto", keepComputerAwake: false } }));
vi.mock("./use-recording-power-status", () => ({ useRecordingPowerStatus: () => ({ audio_disabled: true, capture_paused: false }) }));
vi.mock("gt-react", () => ({ msg: (s: string) => s, useGT: () => (s: string) => s }));
vi.mock("@/lib/hooks/use-settings", () => ({ useSettings: () => ({ settings, updateSettings: vi.fn() }) }));
vi.mock("@/lib/hooks/use-managed-policy", () => ({ useManagedPolicy: () => ({ isSettingLocked: () => false }) }));
vi.mock("@/lib/utils/tauri", () => ({ commands: { setKeepAwake: vi.fn() } }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);
function select(name: string, value: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: value, exact: true }));
}
describe("explicit battery overrides", () => {
  it("requires reviewing the consequences before bypassing battery limits", () => {
    const change = vi.fn();
    render(<BatterySaverSection onChange={change} />);
    select("Power & battery", "Ignore battery limits");
    expect(screen.getByRole("dialog").textContent).toContain("critical-battery pauses will be disabled");
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(change).not.toHaveBeenCalled();
    select("Power & battery", "Ignore battery limits");
    fireEvent.click(screen.getByRole("button", { name: "Save override" }));
    expect(change).toHaveBeenCalledWith({ powerMode: "performance" });
  });
  it("keeps audio policy separate and discloses critical pause and screenshot behavior", () => {
    const change = vi.fn();
    const view = render(<AudioBatteryPolicy value powerMode="auto" onChange={change} />);
    expect(screen.getByText(/interrupt a meeting/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Audio is currently paused");
    select("Audio on low battery", "Keep recording audio");
    expect(change).toHaveBeenCalledWith(false);
    view.rerender(<AudioBatteryPolicy value={false} powerMode="auto" onChange={change} />);
    expect(screen.getByText(/screenshots still pause/)).toBeTruthy();
    expect(screen.getByText(/still pauses at 10%/)).toBeTruthy();
    view.rerender(<AudioBatteryPolicy value={false} powerMode="performance" disabled onChange={change} />);
    expect(screen.getByText(/currently overridden/)).toBeTruthy();
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true);
  });
});
