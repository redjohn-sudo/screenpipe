// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ enterprise: true, resolved: true, loaded: true, enabled: true, source: undefined as string | undefined, save: vi.fn() }));
vi.mock("@/lib/hooks/use-settings", () => ({ useSettings: () => ({ settings: { workflowSource: state.source, user: { token: 'fixture-token' } }, isSettingsLoaded: state.loaded, updateSettings: state.save }) }));
vi.mock("@/lib/hooks/use-is-enterprise-build", () => ({ useEnterpriseBuildStatus: () => ({ isEnterprise: state.enterprise, resolved: state.resolved }) }));
vi.mock("@/lib/workflows/rollout", () => ({ useWorkflowsRolloutEnabled: () => state.enabled }));
vi.mock("./cloud-workflows", () => ({ CloudWorkflows: ({ sourceControl }: any) => <div>Cloud catalog{sourceControl}</div> }));
vi.mock("@/lib/workflows/desktop-platform", () => ({ desktopWorkflowsPlatform: {} }));
vi.mock("@/components/settings/connections-section", () => ({ ConnectionsSection: () => null }));
vi.mock("@/components/connected-share-dialog", () => ({ ConnectedShareDialog: () => null }));
vi.mock("@screenpipe/workflows-ui", () => ({ WorkflowsApp: ({ navigationBrand }: any) => <div>Device catalog{navigationBrand}</div> }));
import { IntegratedWorkflows } from './integrated-workflows';
const props = { active: true, onModeChange: vi.fn(), recordingStatus: null };
beforeEach(() => { state.enterprise = true; state.resolved = true; state.loaded = true; state.enabled = true; state.source = undefined; state.save.mockReset().mockResolvedValue(undefined); });
it("defaults managed builds to cloud and consumers to device", () => {
 const view = render(<IntegratedWorkflows {...props} />); expect(screen.getByText('Cloud catalog')).toBeVisible();
 state.enterprise = false; view.rerender(<IntegratedWorkflows {...props} />); expect(screen.getByText('Device catalog')).toBeVisible();
});
it("waits for persisted settings and enterprise policy without mounting either catalog", () => {
 state.loaded = false; const view = render(<IntegratedWorkflows {...props} />); expect(screen.getByRole('status')).toHaveTextContent('Loading'); expect(screen.queryByText('Cloud catalog')).toBeNull();
 state.loaded = true; state.resolved = false; view.rerender(<IntegratedWorkflows {...props} />); expect(screen.queryByText('Device catalog')).toBeNull();
});
it("respects saved source and persists the explicit switch without enabling any local jobs", async () => {
 state.source = 'device'; render(<IntegratedWorkflows {...props} />);
 expect(screen.getByText('Device catalog')).toBeVisible();
 fireEvent.change(screen.getByRole('combobox', { name: 'Workflow source' }), { target: { value: 'cloud' } });
 await waitFor(() => expect(state.save).toHaveBeenCalledWith({ workflowSource: 'cloud' }));
});
it("keeps the current source when persistence fails", async () => {
 state.save.mockRejectedValue(new Error('disk error')); render(<IntegratedWorkflows {...props} />);
 fireEvent.change(screen.getByRole('combobox', { name: 'Workflow source' }), { target: { value: 'device' } });
 expect(await screen.findByRole('alert')).toHaveTextContent('Could not save'); expect(screen.getByText('Cloud catalog')).toBeVisible();
});
