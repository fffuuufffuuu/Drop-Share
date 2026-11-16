// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UserAvatar } from "./UserAvatar";
afterEach(cleanup);
it.each([[" alice", "A"], ["物理老师", "物"], ["匿名", "匿"], ["🦊Fox", "🦊"], ["", "匿"]])("uses the first visible character for %s", (username, initial) => {
  const { container } = render(<UserAvatar username={username} />);
  expect(container.querySelector(".user-avatar")).toHaveTextContent(initial);
  expect(container.querySelector("img")).toBeNull();
});
it("falls back on image error, retries a replaced URL, and uses empty alt beside a name", () => {
  const { container, rerender } = render(<UserAvatar username="alice" avatarUrl="https://example.com/a.webp" />);
  const image = container.querySelector("img")!; expect(image).toHaveAttribute("alt", "");
  fireEvent.error(image); expect(container.querySelector(".user-avatar")).toHaveTextContent("A");
  rerender(<UserAvatar username="alice" avatarUrl="https://example.com/b.webp" label="当前头像" />);
  expect(screen.getByAltText("当前头像")).toHaveAttribute("src", "https://example.com/b.webp");
});
