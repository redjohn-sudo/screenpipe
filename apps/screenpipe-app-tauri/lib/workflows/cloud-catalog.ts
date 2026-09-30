// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { z } from "zod";
import { commands } from "@/lib/utils/tauri";
import { tauriFetchWithDeadline } from "@/lib/http/tauri-fetch";
import { screenpipeWebUrl } from "@/lib/web-url";

const step = z.object({ action: z.string(), app: z.string().optional(), detail: z.string().optional(), expected_result: z.string().optional() });
const artifact = z.object({
  artifact_id: z.string(), org_id: z.string(), title: z.string(), status: z.string(),
  version: z.number(), updated_at: z.string(), tags: z.array(z.string()).optional(),
  body: z.object({
    summary: z.string().optional(), steps: z.array(step).optional(),
    recurring_workflows: z.array(z.object({ name: z.string(), trigger: z.string().optional(), outcome: z.string().optional(), frequency: z.string().optional(), steps: z.array(step) })).optional(),
  }),
});
const catalog = z.object({ license_id: z.string(), artifacts: z.array(artifact) });
export type CloudWorkflow = { id: string; title: string; summary: string; trigger?: string; outcome?: string; frequency?: string; steps: z.infer<typeof step>[]; updatedAt: string; version: number };
export type CloudWorkflowCatalog = { licenseId: string; workflows: CloudWorkflow[] };

export function parseCloudCatalog(value: unknown): CloudWorkflowCatalog {
  const parsed = catalog.parse(value);
  if (parsed.artifacts.some(item => item.org_id !== parsed.license_id)) throw new Error("Cloud workflow workspace did not match.");
  return { licenseId: parsed.license_id, workflows: parsed.artifacts
    .filter(item => item.status !== "archived" && !item.tags?.includes("studio-chat-draft"))
    .flatMap(item => (item.body.recurring_workflows?.length ? item.body.recurring_workflows : [{ name: item.title, steps: item.body.steps ?? [] }]).map((workflow, index) => ({
      id: `${item.artifact_id}:${index}`, title: workflow.name, summary: item.body.summary ?? "",
      trigger: "trigger" in workflow ? workflow.trigger : undefined,
      outcome: "outcome" in workflow ? workflow.outcome : undefined,
      frequency: "frequency" in workflow ? workflow.frequency : undefined,
      steps: workflow.steps, updatedAt: item.updated_at, version: item.version,
    }))) };
}

const inventoryResponse = z.object({ license_id: z.string(), artifacts: z.array(z.object({
  artifact_id: z.string(), org_id: z.string(), status: z.string(), version: z.number(), updated_at: z.string(), body: z.unknown(),
})) });
const inventoryBody = z.object({ workflows: z.array(z.object({ name: z.string(), why: z.string(), recurrence: z.string().optional() })) });
export function mergeCloudInventory(sops: CloudWorkflowCatalog, value: unknown): CloudWorkflowCatalog {
  const inventory = inventoryResponse.parse(value);
  if (inventory.license_id !== sops.licenseId || inventory.artifacts.some(item => item.org_id !== sops.licenseId)) throw new Error("Cloud workflow workspace did not match.");
  const seen = new Set(sops.workflows.map(workflow => workflow.title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()));
  const workflows = [...sops.workflows];
  for (const item of inventory.artifacts.filter(item => item.artifact_id === "workflow-map" && item.status !== "archived")) {
    for (const [index, workflow] of inventoryBody.parse(item.body).workflows.entries()) {
      const identity = workflow.name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      workflows.push({ id: `${item.artifact_id}:${index}`, title: workflow.name, summary: workflow.why,
        frequency: workflow.recurrence, steps: [], version: item.version, updatedAt: item.updated_at });
    }
  }
  return { ...sops, workflows };
}

/** Existing read:workflows authorization. A device license alone never reads data. */
export async function loadCloudCatalog(userToken?: string, signal?: AbortSignal): Promise<CloudWorkflowCatalog> {
  const teamToken = await commands.getEnterpriseTeamApiToken();
  const headers: Record<string, string> = {};
  if (teamToken) headers.Authorization = `Bearer ${teamToken}`;
  else {
    if (!userToken) throw new Error("Sign in with your workspace admin account, or ask your admin to configure team workflow access in Settings.");
    const license = await commands.getEnterpriseLicenseKey();
    if (!license) throw new Error("Connect this device to your enterprise workspace in Settings.");
    headers.Authorization = `Bearer ${userToken}`;
    headers["X-License-Key"] = license;
  }
  async function read(kind: "sop" | "chart") {
    signal?.throwIfAborted();
    const response = await tauriFetchWithDeadline(screenpipeWebUrl(`/api/enterprise/v1/workflows/generated?kind=${kind}`, "https://screenpipe.com"), { headers, signal }, { timeoutMs: 20_000 });
    if (response.status === 401 || response.status === 403) {
      await response.text();
      throw new Error("Your account cannot read this workspace’s cloud workflows. Ask your admin for workflow access, then refresh.");
    }
    if (!response.ok) { await response.text(); throw new Error("Could not load cloud workflows. Check your connection and try again."); }
    return response.json();
  }
  const sops = parseCloudCatalog(await read("sop"));
  return mergeCloudInventory(sops, await read("chart"));
}
