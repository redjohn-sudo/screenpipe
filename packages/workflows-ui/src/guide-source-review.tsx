// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
"use client";
import { useState } from "react";
import { guideScreenshot, guideSourceStage, isGuideImage, type WorkflowGuide } from "./guide";
import { reconnectGuideSources } from "./guide-video";
import type { WorkflowMap } from "./model";
import styles from "./workflow-guide.module.css";

export function GuideSourceReview({ guide, workflow, onApply }: {
  guide: WorkflowGuide; workflow: WorkflowMap; onApply: (guide: WorkflowGuide) => Promise<void>;
}) {
  const [sources, setSources] = useState(() => guide.steps.map(step => guideSourceStage(guide, step, workflow) ?? (step.sourceStage !== null && workflow.stages[step.sourceStage] ? step.sourceStage : null)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function apply() {
    setBusy(true); setError("");
    try { await onApply(reconnectGuideSources(guide, workflow, sources)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the screenshot links. Try again."); }
    finally { setBusy(false); }
  }
  return <section className={styles.sourceReview} aria-label="Review screenshot links">
    <h3>Reconnect your screenshots</h3>
    <p>The workflow was updated. Check which source belongs to each saved SOP step. Your instructions and narration will stay as they are.</p>
    {guide.steps.map((step, index) => {
      const image = guideScreenshot(workflow, sources[index], step.imageReview) ?? guideScreenshot(workflow, sources[index]);
      return <div className={styles.sourceReviewRow} key={index}>
        <label><strong>{index + 1}. {step.title}</strong><select aria-label={`Screenshot source for step ${index + 1}`} disabled={busy} value={sources[index] ?? "none"} onChange={event => setSources(previous => previous.map((value, i) => i === index ? event.target.value === "none" ? null : Number(event.target.value) : value))}>
          <option value="none">No screenshot source</option>
          {workflow.stages.map((stage, i) => <option key={i} value={i}>{i + 1}. {stage.name}</option>)}
        </select></label>
        {image && isGuideImage(image.dataUrl) && <img src={image.dataUrl} alt={`Proposed source for ${step.title}`} loading="lazy" />}
      </div>;
    })}
    {guide.video?.scenes.some(scene => scene.focus) && <p>Screenshot framing will reset. Your narration and scene order are preserved.</p>}
    {error && <p role="alert">{error}</p>}
    <button className={styles.primary} disabled={busy} onClick={() => void apply()}>{busy ? "Saving screenshot links…" : "Use these sources"}</button>
  </section>;
}
