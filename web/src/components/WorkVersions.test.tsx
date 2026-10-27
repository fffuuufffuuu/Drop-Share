// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { WorkVersionActions } from "./WorkVersionActions";
import { SpaceContributors } from "./SpaceContributors";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const work = { id: "d1", title: "实验", publicSlug: "same", canUpdate: true, canRollback: true, hasPreviousVersion: true };
it("requires selection and confirmation before replacing files at the original work", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: { ...work } });
  const changed = vi.fn();
  render(<WorkVersionActions work={work} action="update" onChanged={changed} />);
  await userEvent.click(screen.getByRole("button", { name: "更新上传实验" }));
  expect(screen.getByText("替换文件，保留网址和统计")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认替换" })).toBeDisabled();
  await userEvent.upload(screen.getByLabelText("选择 HTML 文件"), new File(["new"], "new.html", { type: "text/html" }));
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认替换" }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(post.mock.calls[0][0]).toBe("/deployments/d1/files");
  const form = post.mock.calls[0][1] as FormData;
  expect(form.get("paths")).toBe("new.html");
});
it("hides unauthorized actions and confirms rollback before submitting", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: work });
  const { rerender } = render(<WorkVersionActions work={{ ...work, canUpdate: false }} action="update" onChanged={vi.fn()} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<WorkVersionActions work={{ ...work, canRollback: false }} action="rollback" onChanged={vi.fn()} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<WorkVersionActions work={work} action="rollback" onChanged={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "退回实验上一版" }));
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认退回" }));
  expect(post).toHaveBeenCalledWith("/deployments/d1/rollback");
});
it("uses server permissions to grant and revoke registered contributors without member deletion", async () => {
  localStorage.setItem("token", "test");
  const contributors = [{ userId: "owner", username: "创建者", workCount: 0, role: "creator" }, { userId: "u1", username: "小明", workCount: 2, role: "contributor" }, { userId: "u2", username: "小红", workCount: 0, role: "admin" }, { userId: null, username: "匿名", workCount: 3, role: "contributor" }];
  vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: String(url).endsWith("permissions") ? { canManageAdmins: true } : { contributors } }));
  const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} });
  render(<SpaceContributors spaceId="s1" />);
  await userEvent.click(await screen.findByRole("button", { name: "授予小明管理员" }));
  expect(put).toHaveBeenCalledWith("/spaces/s1/administrators/u1", { enabled: true });
  await userEvent.click(screen.getByRole("button", { name: "撤销小红管理员" }));
  expect(put).toHaveBeenCalledWith("/spaces/s1/administrators/u2", { enabled: false });
  expect(screen.queryByRole("button", { name: /删除|移除|匿名管理员|创建者管理员/ })).not.toBeInTheDocument();
});
it("keeps contributor roles read only when permissions deny administrator management", async () => {
  localStorage.setItem("token", "test");
  vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: String(url).endsWith("permissions") ? { canManageAdmins: false } : { contributors: [{ userId: "u1", username: "小明", workCount: 1, role: "contributor" }] } }));
  render(<SpaceContributors spaceId="s1" />);
  expect(await screen.findByText("小明")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /授予|撤销/ })).not.toBeInTheDocument();
});
