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
  fireEvent.click((await screen.findByRole('heading', { name: 'Review a draft' })).closest('article')!.querySelector('button')!);
  expect(await screen.findByRole('heading', { name: 'Open sources' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Processing details' }));
  expect(screen.getByText('Local workflow analysis is off')).toBeVisible();
  expect(screen.queryByRole('switch', { name: 'Automatic updates' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All workflows' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search workflows' }), { target: { value: 'missing' } });
  expect(screen.getByText('No workflows match these filters')).toBeVisible();
});
it("does not claim off until stopping succeeds; retries partial failure", async () => {
  const service = api(); vi.mocked(service.stopLocal).mockRejectedValueOnce(new Error('offline'));
  render(<CloudWorkflows {...props} api={service} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry stopping local analysis' }));
  fireEvent.click(screen.getByRole('button', { name: 'Processing details' }));
  expect(await screen.findByText('Local workflow analysis is off')).toBeVisible();
  expect(service.stopLocal).toHaveBeenCalledTimes(2);
});
it("clears a formerly loaded catalog when access is revoked", async () => {
  const service = api(); render(<CloudWorkflows {...props} api={service} />);
  await screen.findByRole('heading', { name: 'Review a draft' });
  vi.mocked(service.load).mockRejectedValue(new Error('Access revoked'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  expect(await screen.findByText('Access revoked')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Review a draft' })).not.toBeInTheDocument();
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

it("uses the local navigation shell, collapse control and command palette", async () => {
  render(<CloudWorkflows {...props} api={api()} />);
  await screen.findByRole('heading', { name: 'Your workflows' });
  expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('Home');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse left sidebar' }));
  expect(screen.getByRole('button', { name: 'Open left sidebar' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Open left sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
  expect(screen.getByText('Go to Home')).toBeVisible();
});
it("does not invent captured observations for cloud procedures", async () => {
  render(<CloudWorkflows {...props} api={api()} />);
  fireEvent.click((await screen.findByRole('heading', { name: 'Review a draft' })).closest('article')!.querySelector('button')!);
  expect(screen.getByText('Cloud workflow · Version 3')).toBeVisible();
  expect(screen.queryByText(/Evidence on 0 captured/)).not.toBeInTheDocument();
  expect(screen.queryByText(/0 observations/)).not.toBeInTheDocument();
});
