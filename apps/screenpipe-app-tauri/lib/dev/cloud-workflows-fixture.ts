// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { fixtureWorkflowAnalysis } from "@screenpipe/workflows-ui/fixture";
import { fixtureWorkflowTasks } from "./workflow-tasks-fixture";
import type { CloudWorkflowsServices } from "@/components/workflows/cloud-workflows";
export const fixtureCloudWorkflows: CloudWorkflowsServices = {
  async load() {
    const scenario = new URLSearchParams(window.location.search).get("cloudWorkflowState");
    if (scenario === "error") throw new Error("Your account cannot read this workspace’s cloud workflows. Ask your admin for workflow access, then refresh.");
    return { licenseId: "fictional-workspace", workflows: scenario === "empty" ? [] : [...fixtureWorkflowAnalysis.analysis.workflows].reverse().map((workflow, index) => ({
      id: `fictional-${index}`, title: workflow.title, summary: workflow.description,
      trigger: workflow.trigger, outcome: workflow.outcome, version: 2,
      updatedAt: "2026-09-30T19:00:00Z",
      steps: workflow.stages.map(stage => ({ action: stage.name, detail: stage.description, app: stage.apps[0] })),
    })) };
  },
  async stopLocal() { await fixtureWorkflowTasks.disable(); },
};
