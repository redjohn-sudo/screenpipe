// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordingDetailCard } from "./recording-detail-card";

vi.mock("gt-react", () => ({ msg: (text: string) => text, useMessages: () => (text: string) => text }));

afterEach(cleanup);

describe("recording detail", () => {
  it("names the control and exposes each persisted preset", () => {
    const change = vi.fn();
    render(<RecordingDetailCard value="auto" onChange={change} />);
    const control = screen.getByRole("combobox", { name: "Recording detail" });
    expect(control.getAttribute("aria-describedby")).toBe("recording-detail-description");
    fireEvent.keyDown(control, { key: "ArrowDown" });
    for (const label of ["Auto (recommended)", "Low impact", "Balanced", "More detail"]) {
      expect(screen.getByRole("option", { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("option", { name: "Low impact" }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith("low_impact");
  });

  it("explains the tradeoff when a persisted choice is restored", () => {
    const view = render(<RecordingDetailCard value="low_impact" onChange={() => {}} />);
    expect(screen.getByText(/less searchable text/)).toBeTruthy();
    view.rerender(<RecordingDetailCard value="more_detail" onChange={() => {}} />);
    expect(screen.getByText(/Uses more resources/)).toBeTruthy();
    expect(screen.getByText(/Audio and image quality use their own settings/)).toBeTruthy();
  });
});
