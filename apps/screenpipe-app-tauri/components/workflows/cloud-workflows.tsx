// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ArrowLeft, Search, ChevronRight, Info } from "lucide-react";
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
    <aside style={{ paddingTop: isMac && !fullscreen ? 40 : 28 }} className="flex w-52 shrink-0 flex-col border-r border-border/60 bg-muted/10 p-3 max-sm:w-40">
      <ProductSwitcher mode="workflows" onChange={onModeChange} />
      <div className="px-2 pt-2">{sourceControl}</div>
      <div className="mt-auto">
        <details className="group mx-2 mb-4 text-xs text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><Info size={14} />Processing details<ChevronRight size={12} className="ml-auto transition-transform group-open:rotate-90" /></summary>
          <div className="px-1 pb-2 pt-1 leading-relaxed"><p role="status">{localState === "off" ? "Local workflow analysis is off" : localState === "checking" ? "Turning off local workflow analysis…" : "Could not confirm local analysis is off"}</p><p className="mt-2">Workflows update from your cloud workspace. Recording and uploads keep your existing settings.</p></div>
        </details>
        {recordingStatus}{navigationFooter?.({ openKeyboardShortcuts: () => setShortcuts(true) })}
      </div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-16 max-sm:px-5">
      <div className="mx-auto max-w-3xl">
        {localState === "error" && <div role="alert" className="mb-6 rounded-md border p-4 text-sm">Some local workflow jobs may still be running. <button className="underline" onClick={() => { setLocalState("checking"); setRevision(value => value + 1); }}>Retry stopping local analysis</button></div>}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          {selected ? <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setSelectedId(null)}><ArrowLeft size={14} className="mr-2" />All workflows</Button> : <div className="flex items-baseline gap-3"><h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>{data && !error && <span className="text-sm text-muted-foreground">{data.workflows.length}</span>}</div>}
          <div className="flex items-center gap-2">
            {!selected && !error && <div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" /><Input aria-label="Search cloud workflows" className="h-9 w-48 border-transparent bg-transparent pl-8 shadow-none placeholder:text-muted-foreground focus-visible:border-border max-sm:w-36" placeholder="Search workflows" value={query} onChange={event => setQuery(event.target.value)} /></div>}
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="Refresh" title="Refresh workflows" disabled={loading} onClick={() => { setLocalState("checking"); setRevision(value => value + 1); }}><RefreshCw size={15} className={loading ? "animate-spin motion-reduce:animate-none" : ""} /></Button>
          </div>
        </header>
        {error ? <section role="alert" className="py-10"><h2 className="text-base font-medium">Cloud workflows unavailable</h2><p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{error}</p></section>
        : loading && !data ? <p role="status" className="py-10 text-sm text-muted-foreground">Loading workflows…</p>
        : selected ? <>
          <h1 className="text-2xl font-semibold tracking-tight">{selected.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{selected.summary}</p>
          {selected.trigger && <p className="mt-6 text-sm"><span className="text-muted-foreground">Starts when </span>{selected.trigger}</p>}
          <ol className="mt-8 divide-y divide-border/60 border-y border-border/60">{selected.steps.map((step, index) => <li key={index} className="flex gap-5 py-6"><span className="w-4 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{index + 1}</span><div><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-sm font-medium">{step.action}</h2>{step.app && <span className="text-xs text-muted-foreground">{step.app}</span>}</div>{step.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>}{step.expected_result && <p className="mt-2 text-sm text-muted-foreground">Expected result: {step.expected_result}</p>}</div></li>)}</ol>
          {!selected.steps.length && <p className="mt-6 text-sm text-muted-foreground">This workflow does not have documented steps yet.</p>}
          {selected.outcome && <p className="mt-6 text-sm"><span className="text-muted-foreground">Outcome </span>{selected.outcome}</p>}
          <p className="mt-8 text-xs text-muted-foreground">Version {selected.version}</p>
        </> : <>
          <div className="divide-y divide-border/60 border-t border-border/60">{workflows.map(workflow => <button key={workflow.id} onClick={() => setSelectedId(workflow.id)} className="group flex w-full items-center gap-5 py-6 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{workflow.title}</h2><p className="mt-1.5 truncate text-sm text-muted-foreground">{workflow.summary}</p></div><span className="shrink-0 text-xs tabular-nums text-muted-foreground max-sm:hidden">{workflow.steps.length ? `${workflow.steps.length} steps` : "Discovered"}</span><ChevronRight size={14} className="mr-1 shrink-0 text-muted-foreground/60 group-hover:text-foreground" /></button>)}</div>
          {!workflows.length && <section className="py-16"><h2 className="text-base font-medium">{query ? "No matching workflows" : "No cloud workflows yet"}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{query ? "Try another search." : "Workflows will appear here after your workspace analyzes uploaded activity."}</p></section>}
        </>}
      </div>
    </main>
    <Dialog open={active && shortcuts} onOpenChange={setShortcuts}><DialogContent><DialogHeader><DialogTitle>Cloud workflows</DialogTitle></DialogHeader><p className="text-sm">Use Tab to move between controls and Enter to open a workflow. Use the workspace menu to return to Chat.</p></DialogContent></Dialog>
  </div>;
}
