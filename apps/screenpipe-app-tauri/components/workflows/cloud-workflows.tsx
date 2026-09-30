// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useEffect, useMemo, useState } from "react";
import { Home, Info, RefreshCw, UserRoundCog, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadCloudCatalog, type CloudWorkflowCatalog } from "@/lib/workflows/cloud-catalog";
import { cloudWorkflowMap } from "@/lib/workflows/cloud-presentation";
import { stopLocalWorkflowProcessing } from "@/lib/workflows/cloud-processing";
import { ProductSwitcher, type ProductMode } from "./product-switcher";
import { WorkflowsShell, WorkflowCatalog, WorkflowDetails, WorkflowCommandPalette, WorkflowCatalogPlaceholder,
  defaultWorkflowFilters, type AppView, type WorkflowsPlatform, type WorkflowsAppProps } from "@screenpipe/workflows-ui";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Details have no mutation or local agent capability in cloud mode.
const readOnlyPlatform: WorkflowsPlatform = {
  ensureRuntime: async () => { throw new Error("Cloud view has no local runtime"); },
  analyzeCapturedWork: async () => { throw new Error("Cloud view cannot start local analysis"); },
};
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
  const [data, setData] = useState<CloudWorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localState, setLocalState] = useState<"checking" | "off" | "error">("checking");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(defaultWorkflowFilters);
  const [view, setView] = useState<AppView>("workflows");
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
          setData(null); setSelectedId(null); setView("workflows");
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
  const workflows = useMemo(() => data?.workflows.map(cloudWorkflowMap) ?? [], [data]);
  const selected = workflows.find(workflow => workflow.id === selectedId);
  const refresh = () => { setLocalState("checking"); setRevision(value => value + 1); };
  const navigate = (next: AppView) => setView(next === "profile" ? "profile" : next === "workflow" ? "workflow" : "workflows");
  const openWorkflow = (index: number) => { setSelectedId(workflows[index]?.id ?? null); setView("workflow"); };
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setShortcuts(value => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  const commands: Parameters<typeof WorkflowCommandPalette>[0]["commands"] = [
    { id: "home", label: "Go to Home", detail: "Your workflows", group: "Navigate", icon: Home, action: () => navigate("workflows") },
    { id: "context", label: "Go to Context", detail: "Workspace context", group: "Navigate", icon: UserRoundCog, action: () => navigate("profile") },
    { id: "refresh", label: "Refresh cloud workflows", detail: "Load the latest workspace workflows", group: "Actions", icon: RefreshCw, action: refresh },
    ...workflows.map((workflow, index) => ({ id: workflow.id!, label: workflow.title, detail: "Open workflow", group: "Workflows" as const, icon: Workflow, action: () => openWorkflow(index) })),
  ];
  const processing = <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Processing details" title="Processing details" className="h-8 w-8 text-inherit opacity-70"><Info size={14} /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 text-sm"><p role="status">{localState === "off" ? "Local workflow analysis is off" : localState === "checking" ? "Turning off local workflow analysis…" : "Could not confirm local analysis is off"}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Workflows update from your cloud workspace. Recording and uploads keep your existing settings.</p></PopoverContent></Popover>;
  const refreshControl = <Button variant="ghost" size="icon" aria-label="Refresh" title="Refresh cloud workflows" disabled={loading} onClick={refresh} className="h-9 w-9 text-inherit opacity-70"><RefreshCw size={16} className={loading ? "animate-spin motion-reduce:animate-none" : ""} /></Button>;
  return <>
    <WorkflowsShell view={view} navigate={navigate} runtime={null} workflowCount={workflows.length}
      query={filters.query} setQuery={query => setFilters(current => ({ ...current, query }))}
      activeScope={null} scopes={[]} setScope={() => {}} embedded={false} active={active} fullscreen={fullscreen}
      startWindowDrag={process.env.NEXT_PUBLIC_SCREENPIPE_WEB_DEV === "mock" ? undefined : () => getCurrentWindow().startDragging().catch(() => {})}
      navigationBrand={<><ProductSwitcher mode="workflows" onChange={onModeChange} /><div className="px-2 pt-2">{sourceControl}</div></>}
      navigationFooter={navigationFooter} recordingStatus={recordingStatus} toolbarAccessory={processing}
      openCommandPalette={() => setShortcuts(true)}>
      {localState === "error" && <div role="alert" className="mb-6 rounded-md border p-4 text-sm">Some local workflow jobs may still be running. <button className="underline" onClick={refresh}>Retry stopping local analysis</button></div>}
      {view === "profile" ? <section><h1 className="text-2xl font-semibold">Context</h1><p className="mt-3 text-sm opacity-70">Workspace context is not available in this cloud view yet.</p></section>
        : error ? <section role="alert"><h1 className="text-2xl font-semibold">Cloud workflows unavailable</h1><p className="mt-3 text-sm opacity-70">{error}</p><Button variant="outline" className="mt-4" onClick={refresh}>Refresh</Button></section>
        : loading && !data ? <WorkflowCatalogPlaceholder />
        : view === "workflow" && selected ? <WorkflowDetails workflow={selected} platform={readOnlyPlatform} active={active} navigate={navigate} workProfile={null}
            workflowAgentActions={() => refreshControl} sourceLabel={`Cloud workflow · Version ${selected.revision}`} observationsAvailable={false} canSaveAnswers={false} onAnswersSaved={() => {}} />
        : <WorkflowCatalog workflows={workflows} knownWorkflowCount={workflows.length} filters={filters} setFilters={setFilters} openWorkflow={openWorkflow}
            analyze={refresh} analyzing={loading} error="" activityState={{ cycleId: "", items: [], unavailable: false }} refreshControl={refreshControl}
            emptyState={<section className="py-12"><h2 className="text-lg font-medium">No cloud workflows yet</h2><p className="mt-2 text-sm opacity-70">Workflows will appear here after your workspace analyzes uploaded activity.</p></section>} />}
    </WorkflowsShell>
    <WorkflowCommandPalette open={active && shortcuts} commands={commands} close={() => setShortcuts(false)} />
  </>;
}
