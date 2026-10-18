// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AccountPage } from "./AccountPage";
vi.mock("../api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.get).mockResolvedValue({ data: { username: "teacher", loginUsername: "", phone: "+86 13800138000", email: "" } }); });
it("keeps credential changes disabled until the bound identity has passed step-up verification", async () => {
  render(<MemoryRouter><AccountPage /></MemoryRouter>);
  expect(await screen.findByLabelText("新邮箱")).toBeDisabled();
  expect(screen.getByLabelText("新密码")).toBeDisabled();
  vi.mocked(api.post).mockResolvedValueOnce({ data: { challenge: "current-sub-challenge" } }).mockResolvedValueOnce({ data: { proof: "step-up-proof" } });
  fireEvent.click(screen.getAllByRole("button", { name: "获取验证码" })[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/account/proof/code", { method: "sms" }));
  fireEvent.change(screen.getByLabelText("当前身份验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "验证身份" }));
  await waitFor(() => expect(screen.getByLabelText("新密码")).not.toBeDisabled());
  expect(api.post).toHaveBeenCalledWith("/auth/account/proof/verify", { challenge: "current-sub-challenge", code: "123456" });
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "Secret!123" } });
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "different" } });
  fireEvent.click(screen.getByRole("button", { name: "保存新密码" }));
  expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(2);
});
