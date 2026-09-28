// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import React, { useState } from "react";
import { useGT } from "gt-react";
import { useRecordingPowerStatus } from "./use-recording-power-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordingMode, recordingPreset, recordingStatusText, type RecordingPreferences, type RecordingPreset, type RecordingPresetPatch } from "./recording-policy";

export function RecordingModeCard({ settings, onChange, onCustomize, pending, locked = false }: {
  settings: RecordingPreferences;
  onChange: (patch: RecordingPresetPatch) => void;
  onCustomize: () => void;
  pending: boolean;
  locked?: boolean;
}) {
  const ui = useGT();
  const mode = recordingMode(settings);
  const [proposed, setProposed] = useState<RecordingPreset | null>(null);
  const status = useRecordingPowerStatus();
  const labels = { auto: ui("Automatic (recommended)"), low_impact: ui("Low impact"), more_detail: ui("More detail"), custom: ui("Custom") };
  const descriptions = {
    auto: ui("Balances detail and recording work for your device. Adjusts with battery state and recording speed."),
    low_impact: ui("Fewer intermediate moments and less searchable text. Reduces recording work."),
    more_detail: ui("More intermediate moments and searchable text. Uses more resources when power allows."),
    custom: ui("You have custom recording preferences. Battery protection can temporarily limit them."),
  };
  const interrupted = status?.capture_paused || status?.screenshot_disabled || status?.active_profile === "full_pause" || status?.active_profile === "audio_paused";
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
            else if (value !== mode) setProposed(value as RecordingPreset);
          }}>
            <SelectTrigger aria-labelledby="recording-mode-label" aria-describedby="recording-mode-help" className="w-[215px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["auto", "low_impact", "more_detail", "custom"] as const).map(value => <SelectItem key={value} value={value}>{labels[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {locked && <p className="text-xs text-muted-foreground">{ui("Your organization manages part of this mode. Individual controls remain available where permitted.")}</p>}
        {mode === "custom" && !locked && <Button variant="outline" size="sm" onClick={() => setProposed("auto")}>{ui("Restore Automatic")}</Button>}
        <div className="border-t border-border pt-3 text-xs space-y-1" role={interrupted ? "alert" : "status"}>
          <p className={interrupted ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{ui(recordingStatusText(status))}</p>
          {pending && <p className="font-medium">{ui("Changes pending. Apply & restart to activate them. The status above describes the running recorder.")}</p>}
        </div>
        <p className="text-xs text-muted-foreground">{ui("Modes keep the final capture after scrolling stops, subject to privacy and pause settings. Image clarity is set separately. Audio has its own battery policy.")}</p>
      </CardContent>
    </Card>
    <Dialog open={proposed !== null} onOpenChange={open => { if (!open) setProposed(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ui("Switch to {mode}?", { mode: proposed ? labels[proposed] : "" })}</DialogTitle>
          <DialogDescription>{ui("Review the recording preferences this mode will set. Existing recordings are preserved.")}</DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>{proposed ? descriptions[proposed] : ""}</li>
          {(settings.powerMode ?? "auto") !== "auto" && <li>{ui("Battery behavior: {previous} → Automatic", { previous: settings.powerMode === "performance" ? ui("Ignore battery") : settings.powerMode === "battery_saver" ? ui("Always save battery") : ui("Automatic") })}</li>}
          {settings.idleCaptureIntervalMs != null && <li>{ui("Idle screenshots: {previous} → Follow power profile", { previous: settings.idleCaptureIntervalMs == null ? ui("Follow power profile") : ui("Every {seconds}s", { seconds: settings.idleCaptureIntervalMs / 1000 }) })}</li>}
        </ul>
        <p className="text-xs text-muted-foreground">{ui("Battery protection will be Automatic. Image clarity stays as set, along with capture sources, privacy and audio policy. Apply & restart activates the saved mode.")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setProposed(null)}>{ui("Cancel")}</Button>
          <Button disabled={locked} onClick={() => { if (proposed && !locked) { onChange(recordingPreset(proposed)); setProposed(null); } }}>{ui("Save mode")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
