// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { scrollToSettingsField } from "./settings-search";
vi.mock("gt-react", () => ({ useGT: () => (s: string) => s }));
vi.mock("@/lib/hooks/use-platform", () => ({ usePlatform: () => ({ isMac: true }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reveals nested advanced settings before scrolling to a search result", () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(<details data-testid="advanced"><summary>Advanced recording options</summary><details data-testid="nested"><summary>Power</summary><h3>Power &amp; battery</h3></details></details>);
  scrollToSettingsField("Power & battery");
  expect((screen.getByTestId("advanced") as HTMLDetailsElement).open).toBe(true);
  expect((screen.getByTestId("nested") as HTMLDetailsElement).open).toBe(true);
  expect(scroll).toHaveBeenCalledTimes(1);
});
