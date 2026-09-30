// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Download, Film, Loader2, MessageCircle, X } from "lucide-react";
import type { WorkflowGuide } from "./guide";
import type { WorkflowMap } from "./model";
import { guideVideoScenes, type GuideVideoPlatform, type GuideVideoResult } from "./guide-video";
import styles from "./workflow-guide.module.css";

export type GuideVideoHandle = { generate: (guide: WorkflowGuide, signal: AbortSignal, progress: (text: string) => void) => Promise<void> };
export const GuideVideoPanel = forwardRef<GuideVideoHandle, {
  guide: WorkflowGuide; workflow: WorkflowMap; platform: GuideVideoPlatform;
  save: (guide: WorkflowGuide) => Promise<void>;
  onVideoMode?: (active: boolean) => void;
  onReset?: () => Promise<void>;
}> (function GuideVideoPanel({ guide, workflow, platform, save, onVideoMode, onReset }, ref) {
  const [open, setOpen] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<GuideVideoResult | null>(null);
  const [renderedSource, setRenderedSource] = useState("");
  const current = useRef<GuideVideoResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const source = JSON.stringify(guide);
  let scenes: ReturnType<typeof guideVideoScenes> = [];
  let planError = "";
  try { scenes = guideVideoScenes(guide, workflow, includeImages); } catch (cause) { planError = (cause as Error).message; }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (current.current) void platform.release(current.current).catch(() => {});
    };
  }, [platform]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  useImperativeHandle(ref, () => ({ generate: (next, signal, progress) => generate(next, signal, progress) }));
  async function generate(target = guide, signal?: AbortSignal, progress?: (text: string) => void) {
    if (lock.current) throw new Error("A video is already being created. Stop it before starting another.");
    const selected = guideVideoScenes(target, workflow, includeImages);
    const targetSource = JSON.stringify(target);
    signal?.throwIfAborted();
    setOpen(!signal);
    lock.current = true;
    setBusy(true); setError(""); setMessage("Preparing video");
    const abort = new AbortController();
    controller.current = abort;
    const stop = () => abort.abort();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      await save(target);
      abort.signal.throwIfAborted();
      const next = await platform.generate(selected, abort.signal, text => { if (mounted.current) setMessage(text); progress?.(text); });
      if (!mounted.current || abort.signal.aborted) {
        await platform.release(next);
        if (mounted.current) setMessage("Video creation stopped. Your SOP is unchanged.");
        throw new DOMException("Stopped", "AbortError");
      }
      const previous = current.current;
      current.current = next;
      setOpen(true);
      if (signal) window.dispatchEvent(new CustomEvent("workflows:minimize-assistant"));
      setResult(next); setRenderedSource(targetSource); setMessage("Video ready to review");
      if (previous) void platform.release(previous).catch(() => {});
    } catch (cause) {
      if (mounted.current) {
        if (abort.signal.aborted) setMessage("Video creation stopped. Your SOP is unchanged.");
        else {
          setMessage("");
          setError(typeof cause === "string" ? cause : (cause as Error)?.message || "Could not create the video. Try again.");
        }
      }
      throw cause;
    } finally {
      signal?.removeEventListener("abort", stop);
      lock.current = false;
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function download(captions: boolean) {
    if (!result) return;
    setError("");
    try { if (await platform.export(result, guide.title, captions)) setMessage(captions ? "Captions downloaded" : "Video downloaded"); }
    catch { setMessage(""); setError("Could not download. Your preview is still available; try again."); }
  }
  return <>
    <button ref={trigger} className={styles.actionButton} aria-label="Video SOP" aria-expanded={open} aria-controls="sop-video-panel" onClick={() => { setOpen(!open); if (!open) onVideoMode?.(true); }}>
      {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Film size={16} aria-hidden="true" />} {busy ? "Creating video…" : "Video SOP"}
    </button>
    {open && <section ref={panel} id="sop-video-panel" aria-label="Video SOP" className={styles.videoPanel}>
      <div className={styles.videoHeading}><h2>Create a narrated walkthrough</h2><button aria-label="Close video panel" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16} /></button></div>
      <p>Use this SOP’s instructions and reviewed screenshots. Narration is sent to Screenpipe’s speech service. Screenshots and the video stay on this device.</p>
      {platform.edit && <div className={styles.videoActions}>
        <button disabled={busy || !!planError} onClick={() => { onVideoMode?.(true); setOpen(false); window.dispatchEvent(new CustomEvent("workflows:open-assistant")); }}><MessageCircle size={16} /> Edit video in chat</button>
        <button onClick={() => { onVideoMode?.(false); setOpen(false); }}>Edit SOP instead</button>
      </div>}
      <label><input type="checkbox" checked={includeImages} disabled={busy} onChange={event => setIncludeImages(event.target.checked)} /> Include reviewed screenshots</label>
      {result && <>
        {renderedSource !== source && <p role="status">This preview uses an earlier edit. Create a new video to include your changes.</p>}
        <video key={result.url} controls preload="metadata" src={result.url} aria-label="Narrated SOP preview">
          {result.captionsUrl && <track kind="captions" src={result.captionsUrl} label="Narration" />}
        </video>
        <div className={styles.videoActions}>
          <button onClick={() => void download(false)}><Download size={16} /> Download MP4</button>
          <button onClick={() => void download(true)}>Download captions</button>
        </div>
        <p>Download before leaving this SOP. The preview is temporary.</p>
      </>}
      {scenes.length > 0 && <details className={styles.videoScript}>
        <summary>Review narration · {scenes.length} sections</summary>
        {guide.video && <button disabled={busy} onClick={() => { void onReset?.().catch(() => setError("Could not reset the video script. Try again.")); }}>Reset video script from SOP</button>}
        {scenes.map((scene, i) => <div key={i}><h3>{scene.title}</h3><p>{scene.narration}</p><small>{scene.image || scene.imageFrameId ? "Reviewed screenshot" : "Text slide · no screenshot"}</small></div>)}
      </details>}
      {planError && guide.video && <button disabled={busy} onClick={() => { void onReset?.().catch(() => setError("Could not reset the video script. Try again.")); }}>Reset video script from SOP</button>}
      {(error || planError) && <p role="alert">{error || planError}</p>}
      <div className={styles.videoActions}>
        <button disabled={busy || !!planError} onClick={() => void generate().catch(() => {})}>{busy ? <Loader2 size={16} className={styles.spin} /> : <Film size={16} />}{result ? "Create new video" : error ? "Try again" : "Create video"}</button>
        {busy && <button onClick={() => { controller.current?.abort(); setMessage("Stopping video creation…"); }}>Stop</button>}
        <span role="status" aria-live="polite">{message}</span>
      </div>
    </section>}
  </>;
});
