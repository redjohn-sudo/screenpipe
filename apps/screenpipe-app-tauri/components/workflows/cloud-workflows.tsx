// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useState } from "react";
import { Cloud, RefreshCw, ArrowLeft, Search, ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCloudCatalog, type CloudWorkflowCatalog } from "@/lib/workflows/cloud-catalog";
import { stopLocalWorkflowProcessing } from "@/lib/workflows/cloud-processing";
import { ProductSwitcher, type ProductMode } from "./product-switcher";
import type { WorkflowsAppProps } from "@screenpipe/workflows-ui";
import { usePlatform } from "@/lib/hooks/use-platform";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CloudWorkflowsServices = {
  load: (token?: string, signal?: AbortSignal) => Promise<CloudWorkflowCatalog>;
  stopLocal: (signal?: AbortSignal) => Promise<void>;
};
const services: CloudWorkflowsServices = { load: loadCloudCatalog, stopLocal: stopLocalWorkflowProcessing };
export function CloudWorkflows({ active, token, onModeChange, recordingStatus, navigationFooter, sourceControl, fullscreen = false, api = services }: {
  sourceControl?: React.ReactNode; fullscreen?: boolean; active: boolean; token?: string; onModeChange: (mode: ProductMode) => void;
  recordingStatus: React.ReactNode; navigationFooter?: WorkflowsAppProps["navigationFooter"];
  api?: CloudWorkflowsServices;
}) {
  const { isMac } = usePlatform();
  const [data, setData] = useState<CloudWorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localState, setLocalState] = useState<"checking" | "off" | "error">("checking");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const next = await api.load(token, controller.signal);
        if (!controller.signal.aborted) { setData(next); setError(""); }
      } catch (cause) {
        if (!controller.signal.aborted) {
          // A revoked account must not retain a readable cloud catalog.
          setData(null); setSelectedId(null);
          setError(cause instanceof Error ? cause.message : "Could not load cloud workflows.");
        }
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active, token, revision, api]);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function stop() {
      if (pending) return;
      pending = true;
      try { await api.stopLocal(controller.signal); if (!controller.signal.aborted) setLocalState("off"); }
      catch { if (!controller.signal.aborted) setLocalState("error"); }
      finally { pending = false; }
    }
    void stop();
    // Retry on recorder startup/reconnection, including while Chat is visible.
    const timer = setInterval(stop, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [api, revision]);
  const selected = data?.workflows.find(workflow => workflow.id === selectedId);
  const workflows = data?.workflows.filter(workflow => `${workflow.title} ${workflow.summary}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <div className="ph-no-capture ph-mask relative flex h-full min-h-0 bg-background text-foreground [&_h1]:font-[family-name:var(--font-workflow-heading)] [&_h2]:font-[family-name:var(--font-workflow-heading)]">
    <div className="absolute inset-x-0 top-0 h-7" data-tauri-drag-region onMouseDown={event => { if (event.button === 0 && event.target === event.currentTarget) void getCurrentWindow().startDragging().catch(() => {}); }} />
    <aside style={{ paddingTop: isMac && !fullscreen ? 40 : 28 }} className="flex w-56 shrink-0 flex-col border-r bg-muted/20 p-3 max-sm:w-40">
      <ProductSwitcher mode="workflows" onChange={onModeChange} />
      <div className="px-3 pt-3">{sourceControl}</div>
      <div className="mt-5 flex items-center gap-2 rounded-md bg-foreground/5 px-3 py-2 text-sm font-medium"><Cloud size={16} />Cloud workflows</div>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Generated in your workspace. Updates appear here automatically.</p>
      <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">Recording and uploads continue with your existing settings.</p>
      <div className="mt-auto">{recordingStatus}{navigationFooter?.({ openKeyboardShortcuts: () => setShortcuts(true) })}</div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7 max-sm:px-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Monitor size={14} />{localState === "off" ? "Local workflow analysis is off" : localState === "checking" ? "Turning off local workflow analysis…" : "Could not confirm local analysis is off"}</div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => { setLocalState("checking"); setRevision(value => value + 1); }}><RefreshCw size={14} className="mr-2" />{loading ? "Refreshing…" : "Refresh"}</Button>
        </div>
        {localState === "error" && <div role="alert" className="mb-6 rounded-md border p-4 text-sm">Some local workflow jobs may still be running. <button className="underline" onClick={() => { setLocalState("checking"); setRevision(value => value + 1); }}>Retry stopping local analysis</button></div>}
        {error ? <section role="alert" className="rounded-lg border p-6"><h1 className="text-xl font-semibold">Cloud workflows unavailable</h1><p className="mt-3 text-sm text-muted-foreground">{error}</p></section>
        : loading && !data ? <p role="status">Loading cloud workflows…</p>
        : selected ? <>
          <Button variant="ghost" size="sm" className="mb-5" onClick={() => setSelectedId(null)}><ArrowLeft size={14} className="mr-2" />All workflows</Button>
          <p className="mb-2 text-xs text-muted-foreground">Cloud workflow · Version {selected.version}</p>
          <h1 className="text-2xl font-semibold">{selected.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selected.summary}</p>
          {selected.trigger && <p className="mt-5 text-sm"><strong>Starts when: </strong>{selected.trigger}</p>}
          <ol className="mt-7 space-y-3">{selected.steps.map((step, index) => <li key={index} className="flex gap-4 rounded-lg border p-5"><span className="text-sm text-muted-foreground">{index + 1}</span><div><h2 className="text-sm font-medium">{step.action}</h2>{step.app && <p className="mt-1 text-xs text-muted-foreground">{step.app}</p>}{step.detail && <p className="mt-3 text-sm leading-relaxed">{step.detail}</p>}{step.expected_result && <p className="mt-2 text-sm text-muted-foreground">Expected result: {step.expected_result}</p>}</div></li>)}</ol>
          {!selected.steps.length && <p className="mt-6 text-sm text-muted-foreground">This workflow does not have documented steps yet.</p>}
          {selected.outcome && <p className="mt-6 text-sm"><strong>Outcome: </strong>{selected.outcome}</p>}
        </> : <>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Your cloud workflows</h1><p className="mt-2 text-sm text-muted-foreground">{data?.workflows.length ?? 0} workflows from your workspace</p></div><div className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="Search cloud workflows" className="w-64 pl-9 max-sm:w-full" placeholder="Search workflows" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
          <div className="mt-7 space-y-3">{workflows.map(workflow => <button key={workflow.id} onClick={() => setSelectedId(workflow.id)} className="block w-full rounded-lg border p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><div className="flex items-center justify-between gap-4"><h2 className="text-base font-medium">{workflow.title}</h2><ChevronRight size={16} className="shrink-0 text-muted-foreground" /></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{workflow.summary}</p><p className="mt-4 text-xs text-muted-foreground">{workflow.steps.length} steps · Cloud · Version {workflow.version}</p></button>)}</div>
          {!workflows.length && <section className="mt-12 text-center"><Cloud size={26} className="mx-auto text-muted-foreground" /><h2 className="mt-4 text-lg font-medium">{query ? "No matching workflows" : "No cloud workflows yet"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{query ? "Try another search." : "Workflows will appear after your workspace finishes analyzing uploaded activity. Your admin can check the cloud runner in the workspace."}</p></section>}
        </>}
      </div>
    </main>
    <Dialog open={active && shortcuts} onOpenChange={setShortcuts}><DialogContent><DialogHeader><DialogTitle>Cloud workflows</DialogTitle></DialogHeader><p className="text-sm">Use Tab to move between controls and Enter to open a workflow. Use the workspace menu to return to Chat.</p></DialogContent></Dialog>
  </div>;
}
