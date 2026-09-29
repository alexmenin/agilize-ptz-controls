import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { navigatePresets } from "../../src/renderer/components/presets/keyboard";
import { retainActivePreset } from "../../src/shared/control";
const fixture = (key: string, index = 0) => {
  const buttons = Array.from({ length: 6 }, (_, i) => ({
    matches: (): boolean => true,
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
    click: vi.fn(),
    getBoundingClientRect: () => ({
      top: Math.floor(i / 3) * 100,
      left: (i % 3) * 100,
    }),
  }));
  const event = {
    key,
    target: buttons[index],
    currentTarget: { querySelectorAll: () => buttons },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  return { buttons, event: event as unknown as KeyboardEvent<HTMLElement> };
};
describe("preset navigation", () => {
  it.each([
    ["ArrowRight", 0, 1],
    ["ArrowLeft", 2, 1],
    ["ArrowDown", 1, 4],
    ["ArrowUp", 4, 1],
    ["Home", 5, 0],
    ["End", 0, 5],
  ])("%s selects without activation or double scrolling", (key, from, to) => {
    const { buttons, event } = fixture(String(key), Number(from));
    navigatePresets(event);
    expect(buttons[Number(to)].focus).toHaveBeenCalledWith({
      preventScroll: true,
    });
    expect(buttons[Number(to)].scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
    for (const button of buttons) expect(button.click).not.toHaveBeenCalled();
  });
  it("does not scroll again at a boundary", () => {
    const { buttons, event } = fixture("ArrowLeft");
    navigatePresets(event);
    for (const button of buttons) {
      expect(button.focus).not.toHaveBeenCalled();
      expect(button.scrollIntoView).not.toHaveBeenCalled();
    }
  });
  it("preserves native Enter and Space activation", () => {
    for (const key of ["Enter", " "]) {
      const { event } = fixture(key);
      navigatePresets(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });
  it("leaves menus alone", () => {
    const { event, buttons } = fixture("ArrowDown");
    buttons[0].matches = () => false;
    navigatePresets(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it("preserves unchanged state but applies recalls and stops", () => {
    const previous = { cameraId: "a", presetNumber: 0, sentAt: 1 };
    expect(retainActivePreset(previous, { ...previous })).toBe(previous);
    for (const next of [
      { ...previous, cameraId: "b" },
      { ...previous, presetNumber: 1 },
      { ...previous, sentAt: 2 },
      null,
    ])
      expect(retainActivePreset(previous, next)).toBe(next);
    expect(retainActivePreset(null, null)).toBeNull();
  });
});
