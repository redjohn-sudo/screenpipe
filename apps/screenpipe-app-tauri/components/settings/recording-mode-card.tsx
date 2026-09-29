// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import React, { useState } from "react";
import { derive, useGT } from "gt-react";
import { useRecordingPowerStatus } from "./use-recording-power-status";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordingMode, recordingPreset, recordingStatusText, type RecordingPreferences, type RecordingPreset, type RecordingPresetPatch } from "./recording-policy";

export function RecordingModeCard({ settings, onChange, onCustomize, pending, locked = false }: {
  settings: RecordingPreferences;
  onChange: (patch: Partial<RecordingPresetPatch>) => void;
  onCustomize: () => void;
  pending: boolean;
  locked?: boolean;
}) {
  const ui = useGT();
  const mode = recordingMode(settings);
  const [proposed, setProposed] = useState<RecordingPreset | null>(null);
  const [resetPower, setResetPower] = useState(true);
  const [resetIdle, setResetIdle] = useState(true);
  const propose = (value: RecordingPreset) => {
    setResetPower(true);
    setResetIdle(true);
    setProposed(value);
  };
  const patch: Partial<RecordingPresetPatch> = proposed ? recordingPreset(proposed) : {};
  if (!resetPower) delete patch.powerMode;
  if (!resetIdle) delete patch.idleCaptureIntervalMs;
  const resultingMode = recordingMode({ ...settings, ...patch });
  const status = useRecordingPowerStatus();
  const queuedText = status?.recording_detail?.text_pending;
  const oldestText = status?.recording_detail?.text_oldest_age_seconds;
  const showTextQueue = typeof queuedText === "number" && Number.isSafeInteger(queuedText) && queuedText > 0 &&
    typeof oldestText === "number" && Number.isFinite(oldestText) && oldestText >= 5;
  const labels = { auto: ui("Automatic (recommended)"), low_impact: ui("Low impact"), more_detail: ui("More detail"), custom: ui("Custom") };
  const descriptions = {
    auto: ui("Balances detail and recording work for your device. Adjusts with battery state and recording speed."),
    low_impact: ui("Fewer intermediate moments and less searchable text. Reduces recording work."),
    more_detail: ui("More intermediate moments and searchable text. Uses more resources when power allows."),
    custom: ui("You have custom recording preferences. Battery protection can temporarily limit them."),
  };
  const interrupted = status?.recording_detail?.capture_delayed || status?.capture_paused || status?.screenshot_disabled || status?.active_profile === "full_pause" || status?.active_profile === "audio_paused";
  return <>
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="recording-mode-label" className="text-sm font-medium">Recording mode</h3>
            <p id="recording-mode-help" className="text-xs text-muted-foreground mt-1">{descriptions[mode]}</p>
          </div>
          <Select value={mode} disabled={locked} onValueChange={(value) => {
            if (value === "custom") onCustomize();
            else if (value !== mode) propose(value as RecordingPreset);
          }}>
            <SelectTrigger aria-labelledby="recording-mode-label" aria-describedby="recording-mode-help" className="w-[215px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["auto", "low_impact", "more_detail", "custom"] as const).map(value => <SelectItem key={value} value={value}>{labels[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {locked && <p className="text-xs text-muted-foreground">{ui("Your organization manages part of this mode. Individual controls remain available where permitted.")}</p>}
        {mode === "custom" && !locked && <Button variant="outline" size="sm" onClick={() => propose("auto")}>{ui("Restore Automatic")}</Button>}
        <div className="border-t border-border pt-3 text-xs space-y-1" role={interrupted ? "alert" : "status"}>
          <p className={interrupted ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{ui(derive(recordingStatusText(status)))}</p>
          {showTextQueue && <p className="text-muted-foreground">{ui("Images waiting for text: {count}. Oldest waiting: {age}.", {
            count: queuedText,
            age: oldestText >= 60
              ? ui("{minutes} min {seconds}s", { minutes: Math.floor(oldestText / 60), seconds: Math.floor(oldestText % 60) })
              : ui("{seconds}s", { seconds: Math.floor(oldestText) }),
          })}</p>}
          {pending && <p className="font-medium">{ui("Changes pending. Apply & restart to activate them. The status above describes the running recorder.")}</p>}
        </div>
        <p className="text-xs text-muted-foreground">{ui("Modes keep the final capture after scrolling stops, subject to privacy and pause settings. Image clarity is set separately. Audio has its own battery policy.")}</p>
      </CardContent>
    </Card>
    <Dialog open={proposed !== null} onOpenChange={open => { if (!open) setProposed(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ui("Switch to {mode}?", { mode: proposed ? labels[proposed] : "" })}</DialogTitle>
          <DialogDescription>{ui("Review and customize the changes before saving. Existing recordings are preserved.")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{proposed ? descriptions[proposed] : ""}</p>
        <p className="text-xs text-muted-foreground">{ui("Images are saved before background text processing finishes. Searchable text can take longer to appear during heavy use, especially in Low impact.")}</p>
        {((settings.powerMode ?? "auto") !== "auto" || settings.idleCaptureIntervalMs != null) && (
          <fieldset disabled={locked} className="space-y-3 text-sm">
            <legend className="mb-3 text-xs text-muted-foreground">{ui("Choose the additional changes to include. Uncheck a change to keep your current preference.")}</legend>
            {(settings.powerMode ?? "auto") !== "auto" && (
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={resetPower} onCheckedChange={value => setResetPower(value === true)} className="mt-0.5" />
                <span>{ui("Battery behavior: {previous} → Automatic", { previous: settings.powerMode === "performance" ? ui("Ignore battery") : ui("Always save battery") })}</span>
              </label>
            )}
            {settings.idleCaptureIntervalMs != null && (
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={resetIdle} onCheckedChange={value => setResetIdle(value === true)} className="mt-0.5" />
                <span>{ui("Idle screenshots: {previous} → Follow power profile", { previous: ui("Every {seconds}s", { seconds: settings.idleCaptureIntervalMs / 1000 }) })}</span>
              </label>
            )}
          </fieldset>
        )}
        <div className="border-t border-border pt-3 space-y-2" role="status">
          <p className="text-sm font-medium">{ui("Recording mode after save: {mode}", { mode: labels[resultingMode] })}</p>
          {resultingMode === "custom" && <p className="text-xs text-muted-foreground">{ui("Your selected detail will be combined with the preferences you keep.")}</p>}
          <p className="text-xs text-muted-foreground">{(patch.powerMode ?? settings.powerMode ?? "auto") === "auto"
            ? ui("Battery protection will be Automatic.")
            : ui("Your manual battery behavior stays as set. Automatic low-battery pauses remain overridden; thermal protection still applies.")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{ui("Image clarity stays as set, along with capture sources, privacy and audio policy. Apply & restart activates your saved changes.")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setProposed(null)}>{ui("Cancel")}</Button>
          <Button disabled={locked} onClick={() => { if (proposed && !locked) { onChange(patch); setProposed(null); } }}>{ui("Save changes")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
