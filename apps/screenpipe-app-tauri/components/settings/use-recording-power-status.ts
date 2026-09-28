// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localFetch } from "@/lib/api";
import { useInterval } from "@/lib/hooks/use-interval";
import { isRecordingPowerStatus, type RecordingPowerStatus } from "./recording-policy";

export function useRecordingPowerStatus() {
  const [status, setStatus] = useState<RecordingPowerStatus | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await localFetch("/power");
      const value = response.ok ? await response.json() : null;
      if (mounted.current) setStatus(isRecordingPowerStatus(value) ? value : null);
    } catch {
      if (mounted.current) setStatus(null);
    } finally { inFlight.current = false; }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);
  useInterval(refresh, 5000);
  return status;
}
