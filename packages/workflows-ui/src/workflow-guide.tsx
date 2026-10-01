// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useSourceScreenshot } from "./use-source-screenshot";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { WorkflowMap } from "./model";
import type { WorkflowsPlatform } from "./platform";
import {
  guideHtml,
  guideImage,
  guideScreenshot,
  guideStepIncludesImage,
  guideSourceStage,
  guideNeedsSourceReview,
  guideSourceImages,
  isGuideImage,
  type WorkflowGuide as Guide,
} from "./guide";
import { WorkflowRichText } from "./rich-text";
import { InlineText } from "./inline-text";
import { SopDocument } from "./sop-document";
import { GuideAssistant } from "./guide-assistant";
import { GuideSourceReview } from "./guide-source-review";
import { SopScreenshot } from "./sop-screenshot";
import { GuideVideoPanel, type GuideVideoHandle } from "./guide-video-panel";
import styles from "./workflow-guide.module.css";
import { useGT } from "gt-react";

export function WorkflowGuide({
  workflow,
  platform,
  close,
  backLabel = "Back to workflow",
  sourceMissing = false,
}: {
  workflow: WorkflowMap;
  platform: NonNullable<WorkflowsPlatform["guides"]>;
  close: () => void;
  backLabel?: string;
  sourceMissing?: boolean;
}) {
  const ui = useGT();
  const [promptRequest, setPromptRequest] = useState<{
    id: string;
    text: string;
  }>();
  const [videoMode, setVideoMode] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const videoRequested = useRef(false);
  const [videoContainer, setVideoContainer] = useState<HTMLDivElement | null>(null);
  const videoHandle = useRef<GuideVideoHandle>(null);
  const [draft, setDraft] = useState<Guide | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragging = useRef<number | null>(null);
  const stepKeys = useRef<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openingWeb, setOpeningWeb] = useState(false);
  const webDialog = useRef<HTMLDialogElement>(null);
  const [webError, setWebError] = useState("");
  const [exportError, setExportError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const latest = useRef<Guide | null>(null);
  const saveVersion = useRef(0);
  const loadVersion = useRef(0);
  const mounted = useRef(true);
  async function persist(next: Guide) {
    const version = ++saveVersion.current;
    setSaved("Saving…");
    try {
      await platform.save(next);
      if (mounted.current && version === saveVersion.current)
        setSaved("Saved on this device");
    } catch (cause) {
      if (mounted.current && version === saveVersion.current)
        setSaved("Could not save. Retry before leaving.");
      throw cause;
    }
  }
  function update(next: Guide) {
    latest.current = next;
    setDraft(next);
    void persist(next).catch(() => {});
  }
  async function openGuide() {
    const version = ++loadVersion.current;
    setBusy(true);
    setError("");
    try {
      const existing = await platform.load(workflow);
      if (version !== loadVersion.current) return;
      if (existing) {
        stepKeys.current = existing.steps.map(() => crypto.randomUUID());
        latest.current = existing;
        setDraft(existing);
        setSaved("Saved on this device");
        setBusy(false);
      } else {
        setBusy(false);
        setPromptRequest({
          id: crypto.randomUUID(),
          text: `Create an SOP for ${workflow.title} from its available evidence. Keep missing details as questions and save the draft for review.`,
        });
      }
    } catch {
      if (version === loadVersion.current) {
        setError(
          ui("Your saved guide could not be opened. Its files are unchanged."),
        );
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    void openGuide();
    return () => {
      loadVersion.current++;
      mounted.current = false;
    };
  }, []);
  function jump(event: MouseEvent<HTMLAnchorElement>) {
    // The host uses the URL hash for workflow navigation. Keep section links local.
    event.preventDefault();
    document
      .getElementById(event.currentTarget.hash.slice(1))
      ?.scrollIntoView({ block: "start" });
  }
  const stale = draft && (sourceMissing || guideNeedsSourceReview(draft, workflow));
  async function reconnectSources(next: Guide) {
    const before = latest.current;
    await persist(next);
    if (latest.current !== before) return;
    latest.current = next;
    setDraft(next);
  }
  function moveStep(from: number, to: number) {
    const current = latest.current;
    if (!current || from === to || to < 0 || to >= current.steps.length) return;
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details[data-step-actions][open]")
      .forEach((menu) => {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      });
    const steps = [...current.steps];
    const [step] = steps.splice(from, 1);
    steps.splice(to, 0, step);
    const [key] = stepKeys.current.splice(from, 1);
    stepKeys.current.splice(to, 0, key);
    update({ ...current, steps });
    setAnnouncement(`Step moved to position ${to + 1}`);
  }
  function changeStep(index: number, patch: Partial<Guide["steps"][number]>) {
    const current = latest.current;
    if (current)
      update({
        ...current,
        steps: current.steps.map((step, i) =>
          i === index ? { ...step, ...patch } : step,
        ),
      });
  }
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      root.current
        ?.querySelectorAll<HTMLDetailsElement>(
          "details[data-step-actions][open]",
        )
        .forEach((menu) => {
          if (event.target instanceof Node && !menu.contains(event.target))
            menu.open = false;
        });
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  function lines(
    label: string,
    key: "prerequisites" | "exceptions" | "completion" | "questions",
    placeholder: string,
  ) {
    if (!draft) return null;
    return (
      <section className={styles.section} id={`guide-${key}`}>
        <h2>{label}</h2>
        <InlineText
          label={label}
          placeholder={placeholder}
          value={draft[key].join("\n")}
          onChange={(text) => update({ ...draft, [key]: text.split("\n") })}
        />
      </section>
    );
  }
  return (
    <div ref={root} className={styles.guide}>
      <span role="status" className={styles.srOnly}>
        {announcement}
      </span>
      <header className={styles.toolbar}>
        <button
          onClick={() => {
            close();
          }}
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>
        <div>
          <span role="status" className={styles.saveStatus} title={saved}>
            {saved.startsWith("Could not") ? (
              saved
            ) : (
              <>
                {saved === "Saving…" ? (
                  <Loader2
                    size={16}
                    className={styles.spin}
                    aria-hidden="true"
                  />
                ) : saved ? (
                  <Check size={16} aria-hidden="true" />
                ) : null}
                <span aria-label={saved}>
                  {saved === "Saving…"
                    ? ui("Saving…")
                    : saved
                      ? ui("Saved")
                      : ""}
                </span>
              </>
            )}
          </span>
          {draft && saved.startsWith("Could not") && (
            <button
              onClick={() =>
                latest.current && void persist(latest.current).catch(() => {})
              }
            >
              Retry save
            </button>
          )}
          {draft && (
            <>
              {platform.video && <GuideVideoPanel container={videoContainer} onOpenChange={setVideoOpen} ref={videoHandle} guide={draft} workflow={workflow} platform={platform.video} loadScreenshot={platform.loadScreenshot} save={persist} onVideoMode={setVideoMode} assistantBusy={videoBusy} onCreate={platform.video.edit ? () => {
                if (videoRequested.current) return;
                videoRequested.current = true;
                setVideoBusy(true);
                setVideoMode(true);
                setPromptRequest({ id: crypto.randomUUID(), text: "Create a narrated video from this SOP using its current script and screenshots." });
              } : undefined} onReconnect={sourceMissing ? undefined : reconnectSources} onReset={async () => {
                const { video: _video, ...next } = draft;
                await persist(next); latest.current = next; setDraft(next);
              }} />}
              {platform.openWeb && (
                <button
                  className={styles.actionButton}
                  aria-label={ui("Open web editor")}
                  title={ui("Open web editor")}
                  onClick={() => {
                    webDialog.current?.showModal();
                    setWebError("");
                  }}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  {ui("Open on web")}
                </button>
              )}
              <button
                className={styles.actionButton}
                aria-label={ui("Export SOP")}
                title={ui("Export SOP")}
                onClick={() => {
                  setImages(false);
                  setExportError("");
                  dialog.current?.showModal();
                }}
              >
                <Download size={16} aria-hidden="true" />
                {ui("Export")}
              </button>
            </>
          )}
        </div>
      </header>
      <div ref={setVideoContainer} />
      {!busy && !error && (
        <GuideAssistant
          videoMode={videoMode}
          onVideoBusyChange={(working) => {
            videoRequested.current = working;
            setVideoBusy(working);
          }}
          renderVideo={(guide, signal, progress) => {
            if (!videoHandle.current) throw new Error("Open an SOP before creating its video.");
            return videoHandle.current.generate(guide, signal, progress);
          }}
          guide={draft}
          workflow={workflow}
          platform={platform}
          promptRequest={promptRequest}
          update={async (next) => {
            const original = latest.current;
            await persist(next);
            if (!mounted.current) return;
            if (latest.current !== original) throw new Error("The SOP changed while the assistant was saving. Your newer edit was kept.");
            stepKeys.current = next.steps.map(() => crypto.randomUUID());
            latest.current = next;
            setDraft(next);
          }}
        />
      )}
      <dialog
        ref={webDialog}
        className={styles.exportDialog}
        aria-labelledby="sop-web-title"
        onCancel={(event) => {
          if (openingWeb) event.preventDefault();
        }}
      >
        <div>
          <h2 id="sop-web-title">Open SOP on the web</h2>
          <button
            aria-label="Close web editor confirmation"
            disabled={openingWeb}
            onClick={() => webDialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          Save this SOP’s text to your Screenpipe account to edit and share it.
          Recordings and screenshots stay on this device. Existing web edits are
          preserved.
        </p>
        {webError && <p role="alert">{webError}</p>}
        <div className={styles.dialogActions}>
          <button
            disabled={openingWeb}
            onClick={() => webDialog.current?.close()}
          >
            Cancel
          </button>
          <button
            className={styles.primary}
            disabled={openingWeb || !draft}
            onClick={async () => {
              if (!draft) return;
              setOpeningWeb(true);
              setWebError("");
              try {
                await platform.openWeb?.(draft);
                webDialog.current?.close();
              } catch (e) {
                setWebError(
                  e instanceof Error ? e.message : "Could not open SOP",
                );
              } finally {
                setOpeningWeb(false);
              }
            }}
          >
            {openingWeb ? ui("Opening…") : ui("Continue to web editor")}
          </button>
        </div>
      </dialog>
      {!draft ? (
        <SopDocument title={workflow.title} subtitle="Draft for review">
          <p role="status">
            {busy
              ? "Opening SOP…"
              : "Your SOP will appear here as you work with the assistant."}
          </p>
          {error && <p role="alert">{error}</p>}
          {error && <button onClick={() => void openGuide()}>Try again</button>}
        </SopDocument>
      ) : (
        <div className={styles.layout} hidden={videoOpen}>
          <aside className={styles.outline}>
            <p className={styles.eyebrow}>In this guide</p>
            <a onClick={jump} href="#guide-prerequisites">
              Before you start
            </a>
            {draft.steps.map((step, i) => (
              <a onClick={jump} href={`#guide-step-${i}`} key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {step.title || ui("Untitled step")}
              </a>
            ))}
            <a onClick={jump} href="#guide-completion">
              Check your result
            </a>
            <div className={styles.note}>
              <BookOpen size={18} />
              <p>A draft for your team</p>
              <small>
                Review the steps and remove sensitive information before
                sharing.
              </small>
            </div>
          </aside>
          <SopDocument
            title={draft.title}
            onTitleChange={(title) => update({ ...draft, title })}
            subtitle={<>{draft.steps.length} steps · Draft for review</>}
          >
            <InlineText
              label="Guide summary"
              value={draft.summary}
              onChange={(summary) => update({ ...draft, summary })}
            />
            {stale && (sourceMissing ? <p className={styles.notice}>The source workflow is unavailable. Your saved SOP is still editable.</p> : <GuideSourceReview key={`${draft.sourceRevision}:${workflow.revision}`} guide={draft} workflow={workflow} onApply={reconnectSources} />)}
            {lines(
              "Before you start",
              "prerequisites",
              "No prerequisites confirmed yet. Add the information someone needs before starting.",
            )}
            <div className={styles.steps}>
              {draft.steps.map((step, i) => {
                const sourceStage = guideSourceStage(draft, step, workflow) ?? null;
                const image =
                  !stale && guideStepIncludesImage(step)
                    ? guideImage(workflow, sourceStage, step.imageReview)
                    : null;
                const sources = !stale
                  ? guideSourceImages(workflow, sourceStage).filter(source => isGuideImage(source.dataUrl))
                  : [];
                return (
                  <section
                    className={`${styles.step} ${dragOver === i ? styles.drop : ""}`}
                    key={stepKeys.current[i] ?? i}
                    id={`guide-step-${i}`}
                    onDragOverCapture={(event) => {
                      if (dragging.current !== null) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOver(i);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        setDragOver(null);
                    }}
                    onDropCapture={(event) => {
                      if (dragging.current !== null) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveStep(dragging.current, i);
                        dragging.current = null;
                        setDragOver(null);
                      }
                    }}
                  >
                    <div className={styles.stepHeading}>
                      <button
                        className={styles.grip}
                        aria-label={`Reorder step ${i + 1}`}
                        title="Drag to reorder. Use Alt + arrow keys to move."
                        draggable
                        onDragStart={(event) => {
                          dragging.current = i;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "application/x-screenpipe-workflow",
                            String(i),
                          );
                        }}
                        onDragEnd={() => {
                          dragging.current = null;
                          setDragOver(null);
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.altKey &&
                            ["ArrowUp", "ArrowDown"].includes(event.key)
                          ) {
                            event.preventDefault();
                            moveStep(i, i + (event.key === "ArrowUp" ? -1 : 1));
                          }
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                      <span className={styles.number}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <InlineText
                        className={styles.stepTitle}
                        label={ui("Step {value1} title", { value1: i + 1 })}
                        value={step.title}
                        onChange={(title) => changeStep(i, { title })}
                      />
                      <details
                        className={styles.controls}
                        data-step-actions
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.currentTarget.open = false;
                            event.currentTarget
                              .querySelector("summary")
                              ?.focus();
                          }
                        }}
                      >
                        <summary aria-label={`Step ${i + 1} actions`}>
                          <MoreHorizontal size={18} />
                        </summary>
                        <div className={styles.stepTools}>
                          <button
                            aria-label={ui("Move step {value1} up", {
                              value1: i + 1,
                            })}
                            disabled={i === 0}
                            onClick={() => moveStep(i, i - 1)}
                          >
                            <ArrowUp size={14} />
                            Move up
                          </button>
                          <button
                            aria-label={ui("Move step {value1} down", {
                              value1: i + 1,
                            })}
                            disabled={i === draft.steps.length - 1}
                            onClick={() => moveStep(i, i + 1)}
                          >
                            <ArrowDown size={14} />
                            Move down
                          </button>
                          <button
                            aria-label={ui("Remove step {value1}", {
                              value1: i + 1,
                            })}
                            disabled={draft.steps.length === 1}
                            onClick={() => {
                              stepKeys.current.splice(i, 1);
                              update({
                                ...draft,
                                steps: draft.steps.filter((_, j) => j !== i),
                              });
                              requestAnimationFrame(() =>
                                root.current
                                  ?.querySelector<HTMLTextAreaElement>(
                                    `#guide-step-${Math.min(i, draft.steps.length - 2)} textarea`,
                                  )
                                  ?.focus(),
                              );
                            }}
                          >
                            <Trash2 size={14} />
                            Delete step
                          </button>
                        </div>
                      </details>
                    </div>
                    <div className={styles.stepBody}>
                      <WorkflowRichText
                        value={step.instruction}
                        label={ui("Step {value1} instructions", {
                          value1: i + 1,
                        })}
                        fullDocument
                        onChange={(instruction) =>
                          changeStep(i, { instruction })
                        }
                      />
                      {image ? (
                        <figure>
                          <SopScreenshot
                            load={platform.loadScreenshot}
                            frameId={guideScreenshot(workflow, sourceStage, step.imageReview)!.frameId}
                            src={image}
                            alt={ui("Source for {value1}", {
                              value1: step.title,
                            })}
                            draggable={false}
                          />
                          <button
                            onClick={() =>
                              update({
                                ...draft,
                                steps: draft.steps.map((s, j) =>
                                  j === i ? { ...s, includeImage: false, imageExcluded: true } : s,
                                ),
                              })
                            }
                          >
                            <ImageOff size={14} />
                            Remove screenshot
                          </button>
                        </figure>
                      ) : null}
                      {sources.length > 0 && (!image || sources.length > 1) ? (
                        <ScreenshotReview
                          key={`${step.sourceStage}:${step.imageReview?.frameId}:${step.imageReview?.timestamp}:${sources.map(source => `${source.frameId}:${source.timestamp}`).join(",")}`}
                          sources={sources}
                          selected={step.imageReview}
                          replacing={!!image}
                          title={step.title}
                          load={platform.loadScreenshot}
                          include={(source) => {
                            update({
                              ...draft,
                              steps: draft.steps.map((s, j) =>
                                j === i
                                  ? {
                                      ...s,
                                      includeImage: true,
                                      imageExcluded: false,
                                      imageReview: {
                                        frameId: source.frameId,
                                        timestamp: source.timestamp,
                                      },
                                    }
                                  : s,
                              ),
                            });
                          }}
                        />
                      ) : !image && !stale && guideStepIncludesImage(step) && !step.imageReview && sourceStage !== null && workflow.stages[sourceStage] ? (
                        <SourceSopScreenshot stage={workflow.stages[sourceStage!]} load={platform.loadSourceScreenshot} title={step.title} />
                      ) : !image ? (
                        <p className={styles.muted}>
                          {stale
                            ? ui(
                                "Reconnect this step’s screenshot source above.",
                              )
                            : ui("No captured screenshot for this step.")}
                        </p>
                      ) : null}
                      <div className={styles.result}>
                        <span>Expected result</span>
                        <InlineText
                          label={ui("Step {value1} expected result", {
                            value1: i + 1,
                          })}
                          placeholder="Add an expected result…"
                          value={step.expectedResult}
                          onChange={(expectedResult) =>
                            changeStep(i, { expectedResult })
                          }
                        />
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {draft.steps.length < 40 && (
              <button
                className={styles.addStep}
                onClick={() => {
                  stepKeys.current.push(crypto.randomUUID());
                  update({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      {
                        title: ui("New step"),
                        instruction: "",
                        expectedResult: "",
                        sourceStage: null,
                        includeImage: false,
                      },
                    ],
                  });
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLTextAreaElement>(
                        `#guide-step-${draft.steps.length} textarea`,
                      )
                      ?.focus(),
                  );
                }}
              >
                <Plus size={15} />
                Add step
              </button>
            )}
            {lines("Exceptions", "exceptions", "No exceptions confirmed yet.")}
            {lines(
              "Check your result",
              "completion",
              "Add a check that confirms the workflow is complete.",
            )}
            {lines(
              "Still to confirm",
              "questions",
              "No open questions in this draft.",
            )}
          </SopDocument>
        </div>
      )}
      <dialog ref={dialog} className={styles.exportDialog}>
        <div>
          <h2>Export your SOP</h2>
          <button
            aria-label={ui("Close export")}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          A self-contained HTML document. Open it in a browser, share the file,
          or print it to PDF.
        </p>
        <label>
          <input
            type="checkbox"
            checked={images}
            disabled={Boolean(stale)}
            onChange={(e) => setImages(e.target.checked)}
          />
          Include screenshots I have reviewed
        </label>
        <small>
          Screenshots can contain customer information. Only the selected guide
          content is exported. Original audio and recordings are never attached.
        </small>
        {exportError && <p role="alert">{exportError}</p>}
        <button
          className={styles.primary}
          disabled={exporting || !draft?.title.trim()}
          onClick={async () => {
            if (!draft) return;
            setExporting(true);
            setExportError("");
            try {
              if (
                await platform.export(
                  guideHtml(draft, workflow, images),
                  draft.title,
                )
              )
                dialog.current?.close();
            } catch {
              setExportError(
                "Could not export. Your draft is still open here. Try again.",
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={15} />
          {exporting ? ui("Exporting…") : ui("Export HTML")}
        </button>
      </dialog>
    </div>
  );
}

function ScreenshotReview({
  sources,
  selected,
  replacing,
  title,
  include,
  load,
}: {
  load?: NonNullable<WorkflowsPlatform["guides"]>["loadScreenshot"];
  sources: ReturnType<typeof guideSourceImages>;
  selected?: Guide["steps"][number]["imageReview"];
  replacing: boolean;
  title: string;
  include: (source: ReturnType<typeof guideSourceImages>[number]) => void;
}) {
  const ui = useGT();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(() => Math.max(0, sources.findIndex(source => selected
    ? source.frameId === selected.frameId && source.timestamp === selected.timestamp
    : source.visualVerified)));
  const source = sources[index];
  function choose(next: number) {
    setLoaded(false);
    setFailed(false);
    setIndex(next);
  }
  return (
    <div className={styles.imageReview}>
      <div className={styles.imageReviewHeader}>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? ui("Close screenshot picker") : replacing ? ui("Change screenshot") : ui("Restore screenshot")}
        </button>
      </div>
      {open && (
        <>
          {sources.length > 1 && <div className={styles.imageReviewHeader}>
            <button aria-label={ui("Previous screenshot")} disabled={index === 0} onClick={() => choose(index - 1)}>Previous</button>
            <span>{ui("Screenshot {value1} of {value2}", { value1: index + 1, value2: sources.length })}</span>
            <button aria-label={ui("Next screenshot")} disabled={index === sources.length - 1} onClick={() => choose(index + 1)}>Next</button>
          </div>}
          <SopScreenshot
            load={load}
            frameId={source.frameId}
            key={`${source.frameId}:${source.timestamp}`}
            src={source.dataUrl}
            alt={ui("Review source for {value1}", { value1: title })}
            draggable={false}
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
            }}
            onError={() => {
              setFailed(true);
              setLoaded(false);
            }}
          />
          <div className={styles.imageReviewHeader}>
            <span>
              {failed
                ? ui("This screenshot could not be loaded.")
                : ""}
            </span>
            <button disabled={!loaded || failed} onClick={() => { include(source); setOpen(false); }}>
              Use screenshot
            </button>
          </div>
        </>
      )}
    </div>
  );
}



function SourceSopScreenshot({ stage, load, title }: {
  stage: WorkflowMap["stages"][number];
  load: NonNullable<WorkflowsPlatform["guides"]>["loadSourceScreenshot"];
  title: string;
}) {
  const source = useSourceScreenshot(stage, false, load);
  return <figure ref={source.ref}>
    {source.image ? <img src={source.image.dataUrl} alt={`Source for ${title}`} loading="lazy" draggable={false} />
      : <p className={styles.muted} role="status">{source.status === "loading" ? "Loading screenshot…" : "No captured screenshot available for this step."}
        {source.canRetry && source.status !== "loading" && <button onClick={source.retry}>Try again</button>}
      </p>}
  </figure>;
}
