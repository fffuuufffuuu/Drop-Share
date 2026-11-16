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
  const teacher = await screen.findByText("Teacher");
  expect(teacher.querySelector("img")).toHaveAttribute("src", "https://example.com/t.webp");
  expect(screen.getByText("学生").querySelector(".user-avatar")).toHaveTextContent("学");
  expect(screen.getByText("匿名").querySelector(".user-avatar")).toHaveTextContent("匿");
  expect(screen.getByText("匿名").querySelector("img")).toBeNull();
});
