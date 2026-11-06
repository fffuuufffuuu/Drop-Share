// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("follows system changes until manually selected and synchronizes saved preferences from another tab", async () => {
  localStorage.clear(); let dark = true; let changed = () => {};
  vi.stubGlobal("matchMedia", () => ({ get matches() { return dark; }, addEventListener: (_: string, callback: () => void) => { changed = callback; }, removeEventListener: vi.fn() }));
  render(<ThemeToggle />);
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => { dark = false; changed(); });
  expect(document.documentElement.dataset.theme).toBe("light");
  await userEvent.click(screen.getByRole("button", { name: "切换到夜间模式" }));
  act(() => changed());
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => { localStorage.setItem("drop-share:theme", "light"); window.dispatchEvent(new StorageEvent("storage", { key: "drop-share:theme" })); });
  expect(document.documentElement.dataset.theme).toBe("light");
});
