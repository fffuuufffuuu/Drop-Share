// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkThumbnail } from "./WorkThumbnail";
import { api } from "../api";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("loads hidden thumbnails with authentication as a private blob and revokes its URL", async () => {
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return ""; } static revokeObjectURL() {} });
  const get = vi.spyOn(api, "get").mockResolvedValue({ data: new Blob(["image"], { type: "image/webp" }) });
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-image");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const view = render(<WorkThumbnail title="隐藏作品" publicSlug="hidden-demo" revision={0} readyVersion="public-version" hidden />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:private-image");
  expect(get).toHaveBeenCalledWith("/previews/hidden-demo/thumbnail/private", expect.objectContaining({ responseType: "blob" }));
  expect(create).toHaveBeenCalledOnce(); view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:private-image");
});
it("loads an existing image directly without polling and shows a loading message until it decodes", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<WorkThumbnail title="作品" publicSlug="ready-demo" revision={0} readyVersion="cached" />);
  const image = screen.getByRole("img");
  expect(image).toHaveAttribute("src", expect.stringContaining("/image?version=cached"));
  expect(screen.getByText("正在加载预览图")).toBeInTheDocument();
  fireEvent.load(image);
  expect(screen.queryByText("正在加载预览图")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("distinguishes queueing from image transfer and reuses successful metadata after remount", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 202 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: "prepared" })));
  const first = render(<WorkThumbnail title="作品" publicSlug="queued-demo" revision={0} />);
  await screen.findByText("预览图排队生成中");
  await screen.findByRole("img", {}, { timeout: 4500 });
  expect(screen.getByText("正在加载预览图")).toBeInTheDocument();
  first.unmount();
  render(<WorkThumbnail title="作品" publicSlug="queued-demo" revision={0} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringContaining("version=prepared"));
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("recovers when a listed cached image is invalidated by a newer upload", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ version: "new" })));
  render(<WorkThumbnail title="作品" publicSlug="changed-demo" revision={0} readyVersion="old" />);
  fireEvent.error(screen.getByRole("img"));
  await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringContaining("version=new")));
  expect(fetch).toHaveBeenCalledTimes(1);
});
