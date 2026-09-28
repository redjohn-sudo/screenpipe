// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

"use client";

import { msg, useMessages } from "gt-react";
import { Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RecordingDetail } from "@/lib/utils/tauri";

const descriptions: Record<RecordingDetail, string> = {
  auto: msg("Adjusts detail to recording speed and your power profile. Recommended for most devices.", {}),
  low_impact: msg("Fewer moments during long scrolls and less searchable text. Best for reducing recording work.", {}),
  balanced: msg("A middle ground between scroll detail and recording work.", {}),
  more_detail: msg("More moments during long scrolls and a larger text extraction budget. Uses more resources.", {}),
};

export function RecordingDetailCard({ value, onChange }: {
  value: RecordingDetail;
  onChange: (value: RecordingDetail) => void;
}) {
  const message = useMessages();
  return (
    <Card className="border-border bg-card">
      <CardContent className="px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5 min-w-0 flex-1">
            <Monitor className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 id="recording-detail-label" className="text-sm font-medium text-foreground">Recording detail</h3>
              <p id="recording-detail-description" className="text-xs text-muted-foreground mt-0.5">{message(descriptions[value])}</p>
              <p className="text-xs text-muted-foreground mt-1">Battery and thermal limits can temporarily reduce detail. Audio and image quality use their own settings.</p>
            </div>
          </div>
          <Select value={value} onValueChange={(next) => onChange(next as RecordingDetail)}>
            <SelectTrigger aria-labelledby="recording-detail-label" aria-describedby="recording-detail-description" className="w-[190px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (recommended)</SelectItem>
              <SelectItem value="low_impact">Low impact</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="more_detail">More detail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
