// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AccountMigrationAdmin } from "./AccountMigrationAdmin";
vi.mock("../api", () => ({ api: { post: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("requires an explicit identity review and invalidates approval when its target changes", async () => {
  render(<AccountMigrationAdmin />);
  fireEvent.click(screen.getByText("旧手机号账号迁移审核"));
  expect(screen.getByRole("button", { name: "生成迁移码" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("原账号昵称/用户名"), { target: { value: "原来老师" } });
  fireEvent.change(screen.getByLabelText("已核实的原手机号"), { target: { value: "13800138000" } });
  fireEvent.change(screen.getByLabelText("已确认的新邮箱"), { target: { value: "new@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
  vi.mocked(api.post).mockResolvedValue({ data: { recoveryToken: "signed-approval" } });
  fireEvent.click(screen.getByRole("button", { name: "生成迁移码" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/account-migrations", { username: "原来老师", phone: "13800138000", email: "new@example.com", confirmed: true }));
  expect(await screen.findByLabelText("一次性迁移码")).toHaveValue("signed-approval");
  fireEvent.change(screen.getByLabelText("已确认的新邮箱"), { target: { value: "different@example.com" } });
  expect(screen.queryByLabelText("一次性迁移码")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("shows permission or service failures without displaying a migration code", async () => {
  render(<AccountMigrationAdmin />); fireEvent.click(screen.getByText("旧手机号账号迁移审核"));
  fireEvent.change(screen.getByLabelText("原账号昵称/用户名"), { target: { value: "原来老师" } });
  fireEvent.change(screen.getByLabelText("已核实的原手机号"), { target: { value: "13800138000" } });
  fireEvent.change(screen.getByLabelText("已确认的新邮箱"), { target: { value: "new@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
  vi.mocked(api.post).mockRejectedValue({ response: { data: { message: "仅管理员可访问" } } });
  fireEvent.click(screen.getByRole("button", { name: "生成迁移码" }));
  expect(await screen.findByText("仅管理员可访问")).toBeInTheDocument();
  expect(screen.queryByLabelText("一次性迁移码")).not.toBeInTheDocument();
});
