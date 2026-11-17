// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { SpaceContributors } from "./SpaceContributors";
beforeEach(()=>{localStorage.clear();vi.spyOn(api,"get").mockImplementation(async url=>({data:String(url).endsWith("permissions")?{canManageAdmins:true}:{contributors:[{userId:"u1",username:"Teacher",workCount:3,viewCount:1234,role:"contributor"}]}}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it("expands on hover, shows contribution and view totals, and retracts on leaving the whole panel",async()=>{
  localStorage.setItem("token","owner");render(<SpaceContributors spaceId="s1" drawer />);
  const toggle=screen.getByRole("button",{name:"查看空间贡献者"});
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  await userEvent.hover(toggle);expect(await screen.findByText("Teacher")).toBeInTheDocument();
  expect(screen.getByLabelText("3 个作品")).toHaveTextContent("3");
  expect(screen.getByLabelText("1,234 次访问")).toHaveTextContent("1,234");
  expect(screen.queryByRole("button",{name:/授予|撤销|关闭/})).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/spaces/s1/permissions");
  const panel=screen.getByRole("complementary",{name:"空间贡献者"});
  await userEvent.hover(panel);expect(panel).toBeInTheDocument();
  await userEvent.unhover(panel);await waitFor(()=>expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
  await userEvent.hover(toggle);expect(await screen.findByText("Teacher")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
});
it("supports focus and touch opening without moving admin controls out of management pages",async()=>{
  render(<SpaceContributors spaceId="s1" drawer />);
  await userEvent.tab();expect(await screen.findByText("Teacher")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button",{name:"查看空间贡献者"}));expect(await screen.findByText("Teacher")).toBeInTheDocument();
});

it("shows contributor pictures and names, initials without pictures, and neutral anonymous avatars", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { contributors: [
    { userId: "u", username: "Teacher", avatarUrl: "https://example.com/t.webp", workCount: 1, role: "creator" },
    { userId: "v", username: "学生", workCount: 1, role: "contributor" },
    { userId: null, username: "匿名", avatarUrl: "https://example.com/ignored.webp", workCount: 1, role: "contributor" },
  ] } });
  render(<SpaceContributors spaceId="s" />);
  const teacher = (await screen.findByText("Teacher")).closest(".contributor-identity")!;
  expect(teacher.querySelector("img")).toHaveAttribute("src", "https://example.com/t.webp");
  expect(screen.getByText("学生").closest(".contributor-identity")!.querySelector(".user-avatar")).toHaveTextContent("学");
  const anonymous = screen.getByText("匿名").closest(".contributor-identity")!;
  expect(anonymous.querySelector(".user-avatar")).toHaveTextContent("匿");
  expect(anonymous.querySelector("img")).toBeNull();
});

function expectAvatarBesideName(name: string, initial: string, meta: string) {
  const row = screen.getByText(name).closest(".contributor-identity")!;
  const avatar = row.querySelector(".user-avatar")!;
  const copy = row.querySelector(".contributor-copy")!;
  expect(avatar).toHaveTextContent(initial);
  expect(avatar.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(copy.querySelector("strong")).toHaveTextContent(name);
  expect(copy).toHaveTextContent(meta);
  expect(screen.getByText(name).contains(avatar)).toBe(false);
}

it("keeps management-list avatars on one row with the name and meta, and action buttons on the right", async () => {
  localStorage.setItem("token", "owner");
  vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: String(url).endsWith("permissions")
    ? { canManageAdmins: true }
    : { contributors: [
      { userId: "a", username: "腰果先生", workCount: 2, viewCount: 10, role: "creator" },
      { userId: "b", username: "Tinna", workCount: 1, viewCount: 4, role: "admin" },
      { userId: "c", username: "Sophie", workCount: 1, viewCount: 3, role: "contributor" },
    ] } }));
  render(<SpaceContributors spaceId="s1" />);
  await screen.findByText("腰果先生");
  expectAvatarBesideName("腰果先生", "腰", "创建者 · 2 个作品 · 10 次访问");
  expectAvatarBesideName("Tinna", "T", "管理员 · 1 个作品 · 4 次访问");
  expectAvatarBesideName("Sophie", "S", "贡献者 · 1 个作品 · 3 次访问");
  const sophieRow = screen.getByText("Sophie").closest("li")!;
  expect(sophieRow.querySelector(".contributor-identity")!.compareDocumentPosition(screen.getByRole("button", { name: "授予Sophie管理员" })) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(screen.getByRole("button", { name: "撤销Tinna管理员" })).toBeInTheDocument();
});

it("keeps hover-panel avatars on one row with the nickname and role", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { contributors: [
    { userId: "a", username: "腰果先生", workCount: 2, viewCount: 10, role: "creator" },
    { userId: "b", username: "Tinna", workCount: 1, viewCount: 4, role: "admin" },
    { userId: "c", username: "Sophie", workCount: 1, viewCount: 3, role: "contributor" },
  ] } });
  render(<SpaceContributors spaceId="s1" drawer />);
  await userEvent.hover(screen.getByRole("button", { name: "查看空间贡献者" }));
  await screen.findByText("腰果先生");
  expectAvatarBesideName("腰果先生", "腰", "创建者");
  expectAvatarBesideName("Tinna", "T", "管理员");
  expectAvatarBesideName("Sophie", "S", "贡献者");
  expect(screen.getByText("Sophie").closest(".contributor-summary")!.querySelector(".contributor-stats")).toHaveTextContent("1");
});
