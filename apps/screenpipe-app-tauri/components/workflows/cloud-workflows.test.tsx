// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CloudWorkflows, type CloudWorkflowsServices } from "./cloud-workflows";
vi.mock("./product-switcher", () => ({ ProductSwitcher: () => <button>Workflows</button> }));
vi.mock("@/lib/workflows/cloud-catalog", () => ({ loadCloudCatalog: vi.fn() }));
vi.mock("@/lib/workflows/cloud-processing", () => ({ stopLocalWorkflowProcessing: vi.fn() }));
const data = { licenseId: 'org-a', workflows: [{ id: 'a', title: 'Review a draft', summary: 'Check the supporting sources.', steps: [{ action: 'Open sources', detail: 'Check the citations' }], version: 3, updatedAt: '2026-09-30' }] };
function api(): CloudWorkflowsServices { return { load: vi.fn().mockResolvedValue(data), stopLocal: vi.fn().mockResolvedValue(undefined) }; }
const props = { active: true, onModeChange: vi.fn(), recordingStatus: <button>Recording</button> };
it("renders cloud detail and search without any local analysis controls", async () => {
  render(<CloudWorkflows {...props} api={api()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Review a draft/ }));
  expect(await screen.findByRole('heading', { name: 'Open sources' })).toBeVisible();
  expect(screen.getByText('Local workflow analysis is off')).toBeVisible();
  expect(screen.queryByRole('switch', { name: 'Automatic updates' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All workflows' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search cloud workflows' }), { target: { value: 'missing' } });
  expect(screen.getByText('No matching workflows')).toBeVisible();
});
it("does not claim off until stopping succeeds; retries partial failure", async () => {
  const service = api(); vi.mocked(service.stopLocal).mockRejectedValueOnce(new Error('offline'));
  render(<CloudWorkflows {...props} api={service} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry stopping local analysis' }));
  expect(await screen.findByText('Local workflow analysis is off')).toBeVisible();
  expect(service.stopLocal).toHaveBeenCalledTimes(2);
});
it("clears a formerly loaded catalog when access is revoked", async () => {
  const service = api(); render(<CloudWorkflows {...props} api={service} />);
  await screen.findByRole('button', { name: /Review a draft/ });
  vi.mocked(service.load).mockRejectedValue(new Error('Access revoked'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  expect(await screen.findByText('Access revoked')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Review a draft/ })).not.toBeInTheDocument();
});
it("keeps empty distinct from error", async () => {
  const service = api(); vi.mocked(service.load).mockResolvedValue({ licenseId: 'org-a', workflows: [] });
  render(<CloudWorkflows {...props} api={service} />);
  expect(await screen.findByText('No cloud workflows yet')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it("aborts requests and discards late results after unmount", async () => {
  const service = api(); let resolve!: (value: typeof data) => void;
  vi.mocked(service.load).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<CloudWorkflows {...props} api={service} />);
  await waitFor(() => expect(service.load).toHaveBeenCalled());
  const signal = vi.mocked(service.load).mock.calls[0][1]!;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(data));
  expect(screen.queryByText('Review a draft')).not.toBeInTheDocument();
});
