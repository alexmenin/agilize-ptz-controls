import type { KeyboardEvent } from "react";
export const navigatePresets = (event: KeyboardEvent<HTMLElement>) => {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  const target = event.target as HTMLElement;
  if (!target.matches("[data-preset-recall]")) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "[data-preset-recall]:not(:disabled)",
    ),
  );
  const index = buttons.indexOf(target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  event.stopPropagation();
  let next = index;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = buttons.length - 1;
  else if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
  else if (event.key === "ArrowRight")
    next = Math.min(buttons.length - 1, index + 1);
  else {
    const rect = target.getBoundingClientRect();
    const down = event.key === "ArrowDown";
    const candidates = buttons
      .map((button, i) => ({ i, rect: button.getBoundingClientRect() }))
      .filter((b) =>
        down ? b.rect.top > rect.top + 4 : b.rect.top < rect.top - 4,
      )
      .sort(
        (a, b) =>
          Math.abs(a.rect.top - rect.top) - Math.abs(b.rect.top - rect.top) ||
          Math.abs(a.rect.left - rect.left) - Math.abs(b.rect.left - rect.left),
      );
    if (candidates[0]) next = candidates[0].i;
  }
  if (next === index) return;
  buttons[next]?.focus({ preventScroll: true });
  buttons[next]?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
};
