// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from "vitest";
import { recordingMode, recordingPreset, recordingStatusText, type RecordingPowerStatus } from "./recording-policy";

const active: RecordingPowerStatus = {
  state: { on_ac: true, battery_pct: 100, os_low_power: false, thermal_state: "nominal" },
  active_profile: "performance", user_pref: "auto", pause_audio_on_low_battery: true,
  recording_detail: { preferred_mode: "more_detail", scroll_interval_ms: 1000, reason: "preference" },
};

describe("recording preference hierarchy", () => {
  it("derives presets and Custom from actual legacy preferences without rewriting them", () => {
    expect(recordingMode({})).toBe("auto");
    for (const mode of ["auto", "low_impact", "more_detail"] as const) expect(recordingMode(recordingPreset(mode))).toBe(mode);
    for (const override of [{ powerMode: "performance" as const }, { powerMode: "battery_saver" as const }, { videoQuality: "high" }, { idleCaptureIntervalMs: 2000 }, { recordingDetail: "balanced" as const }]) {
      const settings = { ...recordingPreset("auto"), ...override };
      const original = { ...settings };
      expect(recordingMode(settings)).toBe("custom");
      expect(settings).toEqual(original);
    }
  });
  it("preset patches change only declared recording preferences, preserving privacy and audio", () => {
    const settings = { ignoredWindows: ["Private"], disableAudio: true, pauseAudioOnLowBattery: false, keepComputerAwake: true, highFpsEnabled: true };
    expect({ ...settings, ...recordingPreset("more_detail") }).toMatchObject(settings);
    expect(Object.keys(recordingPreset("auto")).sort()).toEqual(["idleCaptureIntervalMs", "powerMode", "recordingDetail", "videoQuality"]);
  });
  it("reports actual interruptions, temporary limits, recovery and unavailable status", () => {
    expect(recordingStatusText(null)).toContain("unavailable");
    expect(recordingStatusText({ ...active, active_profile: "full_pause" })).toContain("Recording paused");
    expect(recordingStatusText({ ...active, active_profile: "audio_paused" })).toContain("Audio and screenshots paused");
    expect(recordingStatusText({ ...active, active_profile: "saver", state: { ...active.state, thermal_state: "serious" } })).toContain("device is hot");
    expect(recordingStatusText({ ...active, active_profile: "saver", state: { ...active.state, on_ac: false } })).toContain("Saving battery");
    expect(recordingStatusText({ ...active, recording_detail: { ...active.recording_detail!, reason: "capture_cost" } })).toContain("recording is taking longer");
    expect(recordingStatusText({ ...active, active_profile: "saver", screenshot_disabled: true, audio_disabled: false })).toContain("Audio and searchable screen text continue");
    expect(recordingStatusText(active)).toContain("Battery protection is on");
    expect(recordingStatusText({ ...active, user_pref: "performance" })).toContain("overridden");
  });
});
