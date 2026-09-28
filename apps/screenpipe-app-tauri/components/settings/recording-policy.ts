// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { RecordingDetail } from "@/lib/utils/tauri";

export type RecordingPreset = "auto" | "low_impact" | "more_detail";
export type RecordingPreferences = {
  recordingDetail?: RecordingDetail;
  powerMode?: "auto" | "performance" | "battery_saver";
  videoQuality?: string;
  idleCaptureIntervalMs?: number | null;
};
export const presetKeys = ["recordingDetail", "powerMode", "idleCaptureIntervalMs"] as const;

/** Derive the label from real preferences, including legacy installs. No second
 * saved mode can drift out of sync with the settings it claims to control. */
export function recordingMode(settings: RecordingPreferences): RecordingPreset | "custom" {
  const detail = settings.recordingDetail ?? "auto";
  if ((settings.powerMode ?? "auto") !== "auto" ||
      settings.idleCaptureIntervalMs != null || detail === "balanced") return "custom";
  return detail;
}

export type RecordingPresetPatch = Required<Pick<RecordingPreferences, typeof presetKeys[number]>>;

// Image clarity is independent of sampling detail. Never overwrite its saved value.
export function recordingPreset(mode: RecordingPreset): RecordingPresetPatch {
  return { recordingDetail: mode, powerMode: "auto", idleCaptureIntervalMs: null };
}

export interface RecordingPowerStatus {
  state: { on_ac: boolean; battery_pct: number | null; os_low_power: boolean; thermal_state: string };
  active_profile: "performance" | "balanced" | "saver" | "audio_paused" | "full_pause";
  user_pref: "auto" | "performance" | "battery_saver";
  pause_audio_on_low_battery: boolean;
  audio_disabled?: boolean;
  screenshot_disabled?: boolean;
  capture_paused?: boolean;
  recording_detail?: { preferred_mode: RecordingDetail; scroll_interval_ms: number; reason: string };
}

export function isRecordingPowerStatus(value: unknown): value is RecordingPowerStatus {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<RecordingPowerStatus>;
  return !!s.state && typeof s.state.on_ac === "boolean" &&
    ["performance", "balanced", "saver", "audio_paused", "full_pause"].includes(s.active_profile ?? "") &&
    ["auto", "performance", "battery_saver"].includes(s.user_pref ?? "");
}

/** Explain observed runtime state, never infer the active mode from saved prefs. */
export function recordingStatusText(status: RecordingPowerStatus | null): string {
  if (!status) return "Recording status unavailable. Saved preferences are shown above.";
  if (status.capture_paused || status.active_profile === "full_pause") return "Recording paused at critical battery. Connect power to resume.";
  if (status.active_profile === "audio_paused") return "Audio and screenshots paused at low battery. Searchable screen text continues. Connect power to resume.";
  if (status.screenshot_disabled) return "Screenshots paused at low battery. Audio and searchable screen text continue according to your capture preferences.";
  if (["serious", "critical"].includes(status.state.thermal_state)) return "Temporarily reducing recording work because your device is hot. Your preferences are preserved.";
  if (status.user_pref === "performance") return "Battery limits are overridden. Thermal protection still applies.";
  if (status.user_pref === "battery_saver") return "Battery saver is always on, including while plugged in.";
  if (status.recording_detail?.reason === "capture_cost") return "Temporarily capturing fewer intermediate moments because recording is taking longer. Detail recovers automatically.";
  if (status.active_profile !== "performance") return status.state.os_low_power
    ? "Low Power Mode is reducing recording work. Your preferred detail returns when limits lift."
    : "Saving battery: fewer intermediate captures and lower image encoding quality. Your preferences return when plugged in.";
  return "Battery protection is on. Recording adapts automatically when power or recording speed changes.";
}
