// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { SpacePage } from "./SpacePage";

beforeEach(() => {
  localStorage.setItem("token", "user-token");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SpacePage", () => {
  it("shows one space deadline without project-level deadlines", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        id: "s1",
        name: "作品空间",
        slug: "portfolio",
        expiresAt: "2027-07-30T01:00:00.000Z",
        deployments: [{
          id: "d1",
          title: "作品一",
          publicSlug: "work-one",
          visibility: "visible",
          createdAt: "2026-07-30T01:00:00.000Z",
          expiresAt: "2020-01-01T00:00:00.000Z",
          uploaderName: "member",
        }, {
          id: "d2",
          title: "匿名作品",
          publicSlug: "anonymous-work",
          visibility: "hidden",
          createdAt: "2026-07-30T02:00:00.000Z",
          expiresAt: "2020-01-01T00:00:00.000Z",
          uploaderName: "匿名",
        }],
      },
    });

    render(
      <MemoryRouter initialEntries={["/spaces/s1"]}>
        <Routes>
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(
      `空间内作品统一于 ${new Date("2027-07-30T01:00:00.000Z").toLocaleString()} 到期`,
    )).toBeInTheDocument();
    expect(screen.getByText("作品一")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "上传者" })).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
    expect(screen.getByText("匿名")).toBeInTheDocument();
    const workRow = screen.getByText("作品一").closest("tr")!;
    expect(within(workRow).getByRole("button", { name: "显示/隐藏" }).parentElement)
      .toHaveClass("space-deployment-actions");
    expect(screen.queryByRole("columnheader", { name: "到期" })).not.toBeInTheDocument();
  });
});
