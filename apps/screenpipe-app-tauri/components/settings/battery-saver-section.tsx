// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import React, { useState } from "react";
import { useGT, msg } from "gt-react";
import { useSettings, type Settings } from "@/lib/hooks/use-settings";
import { useManagedPolicy } from "@/lib/hooks/use-managed-policy";
import { commands } from "@/lib/utils/tauri";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRecordingPowerStatus } from "./use-recording-power-status";
import type { SettingsField } from "./settings-search";

export const searchIndex: SettingsField[] = [
  { label: msg("Power & battery", {}), keywords: ["power", "battery", "performance", "saver"] },
  { label: msg("Keep computer awake", {}), keywords: ["sleep", "awake", "power"] },
];

export function BatterySaverSection({ onChange }: { onChange: (patch: Partial<Settings>) => void }) {
  const ui = useGT();
  const { settings, updateSettings } = useSettings();
  const { isSettingLocked } = useManagedPolicy();
  const { toast } = useToast();
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [updatingAwake, setUpdatingAwake] = useState(false);
  const powerMode = settings.powerMode ?? "auto";
  const powerLocked = isSettingLocked("powerMode");
  const setAwake = async (enabled: boolean) => {
    if (updatingAwake || isSettingLocked("keepComputerAwake")) return;
    const previous = settings.keepComputerAwake ?? false;
    setUpdatingAwake(true);
    try {
      await updateSettings({ keepComputerAwake: enabled });
      const result = await commands.setKeepAwake(enabled);
      if (result.status === "error") throw new Error(String(result.error));
    } catch (error) {
      await updateSettings({ keepComputerAwake: previous });
      toast({ title: ui("Couldn't update keep-awake"), description: String(error), variant: "destructive" });
    } finally { setUpdatingAwake(false); }
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <h3 id="power-behavior-label" className="text-sm font-medium">Power &amp; battery</h3>
        <p className="text-xs text-muted-foreground mt-1">{ui("Automatic temporarily reduces recording work on battery and restores your preferences when power returns.")}</p>
      </div>
      <Select value={powerMode} disabled={powerLocked} onValueChange={value => {
        if (value === "performance") setConfirmOverride(true);
        else onChange({ powerMode: value as "auto" | "battery_saver" });
      }}>
        <SelectTrigger aria-labelledby="power-behavior-label" className="w-[210px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{ui("Automatic (recommended)")}</SelectItem>
          <SelectItem value="battery_saver">{ui("Always save battery")}</SelectItem>
          <SelectItem value="performance">{ui("Ignore battery limits")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <p className="text-xs text-muted-foreground">{powerMode === "auto"
      ? ui("At 10% battery or below while unplugged, all recording pauses. At 20% or below, your Audio & meetings battery policy applies. Low Power Mode reduces work; it does not by itself stop recording.")
      : powerMode === "performance"
        ? ui("Recording continues even at critical battery. This can drain your battery faster. Thermal protection still applies.")
        : ui("Uses reduced capture settings even when plugged in. This manual mode does not use the automatic low-battery pause policy.")}</p>
    <div className="flex justify-between gap-3 border-t border-border pt-3">
      <div>
        <label htmlFor="keepComputerAwake" className="text-sm font-medium">Keep computer awake</label>
        <p className="text-xs text-muted-foreground mt-1">{ui("Keeps recording and scheduled tasks running when you step away. Uses more battery. Without it, system sleep pauses capture. Applies immediately.")}</p>
      </div>
      <Switch id="keepComputerAwake" checked={settings.keepComputerAwake ?? false} disabled={updatingAwake || isSettingLocked("keepComputerAwake")} onCheckedChange={setAwake} aria-label={ui("Keep computer awake")} />
    </div>
    <Dialog open={confirmOverride} onOpenChange={setConfirmOverride}>
      <DialogContent>
        <DialogHeader><DialogTitle>{ui("Ignore battery limits?")}</DialogTitle><DialogDescription>{ui("Recording will continue at your chosen detail even when battery is low. Automatic audio and critical-battery pauses will be disabled. Thermal protection still applies. Your recording mode will become Custom.")}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setConfirmOverride(false)}>{ui("Cancel")}</Button><Button disabled={powerLocked} onClick={() => { if (!powerLocked) { onChange({ powerMode: "performance" }); setConfirmOverride(false); } }}>{ui("Save override")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export function AudioBatteryPolicy({ value, powerMode, disabled, onChange }: {
  value: boolean;
  powerMode?: string;
  disabled?: boolean;
  onChange: (pause: boolean) => void;
}) {
  const ui = useGT();
  const status = useRecordingPowerStatus();
  return <Card className="border-border bg-card"><CardContent className="px-3 py-3 space-y-2">
    {(status?.audio_disabled || status?.capture_paused) && <p role="alert" className="text-xs font-medium text-amber-600 dark:text-amber-400">{status.capture_paused
      ? ui("Recording is currently paused at critical battery. Connect power to resume.")
      : ui("Audio is currently paused by the low-battery policy. Connect power to resume, or change this policy and apply it.")}</p>}
    <div className="flex flex-wrap justify-between gap-3">
      <div className="flex-1 min-w-0"><h3 id="audio-battery-policy" className="text-sm font-medium">Audio on low battery</h3><p className="text-xs text-muted-foreground mt-1">{ui("Choose what happens at 20% battery or below while unplugged. This can interrupt a meeting.")}</p></div>
      <Select value={value ? "pause" : "continue"} disabled={disabled} onValueChange={next => onChange(next === "pause")}>
        <SelectTrigger aria-labelledby="audio-battery-policy" className="w-[210px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="pause">{ui("Pause to save battery")}</SelectItem><SelectItem value="continue">{ui("Keep recording audio")}</SelectItem></SelectContent>
      </Select>
    </div>
    <p className="text-xs text-muted-foreground">{value
      ? ui("Audio and screenshots pause; searchable screen text continues. Connect power to resume.")
      : ui("Audio continues; screenshots still pause and searchable screen text continues. Uses more battery.")}</p>
    <p className="text-xs text-muted-foreground">{(powerMode ?? "auto") === "auto"
      ? ui("All recording still pauses at 10% or below. Recording modes preserve this audio preference. Apply & restart to activate changes.")
      : ui("This preference is currently overridden by your manual Power & battery setting in Screen → Advanced recording options.")}</p>
  </CardContent></Card>;
}
