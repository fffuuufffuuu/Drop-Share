// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { hasCloudbaseSession, storeCloudbaseSession } from "../cloudbase-session";
import { EmailLoginPage } from "./EmailLoginPage";
vi.mock("../api", () => ({ api: { post: vi.fn() }, setAuthToken: vi.fn() }));
vi.mock("../cloudbase-session", () => ({ hasCloudbaseSession: vi.fn(() => false), storeCloudbaseSession: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.mocked(hasCloudbaseSession).mockReturnValue(false); });
afterEach(cleanup);
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function page(mode = "login") { return render(<MemoryRouter initialEntries={[`/login?mode=${mode}&next=%2Fdashboard%3Ftab%3Dspaces`]}><EmailLoginPage /><Location /></MemoryRouter>); }
function fillCredentials(migrate = false) {
  fireEvent.change(screen.getByLabelText(migrate ? "新用户名" : "用户名"), { target: { value: "teacher" } });
  fireEvent.change(screen.getByLabelText("设置密码"), { target: { value: "Secret!123" } });
  fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Secret!123" } });
}
const auth = { token: "access", refreshToken: "refresh", expiresIn: 3600, user: { id: "original", username: "teacher", role: "USER" } };
it("defaults to username/email password login and never offers SMS login", () => {
  page(); expect(screen.getByLabelText("用户名/邮箱")).toBeInTheDocument();
  expect(screen.queryByText("手机验证码")).not.toBeInTheDocument();
  expect(screen.queryByText("邮箱验证码登录")).not.toBeInTheDocument();
});
it.each(["teacher", "teacher@example.com"])("logs in with %s and keeps the intended destination", async account => {
  page(); vi.mocked(api.post).mockResolvedValue({ data: auth });
  fireEvent.change(screen.getByLabelText("用户名/邮箱"), { target: { value: account } });
  fireEvent.change(screen.getByLabelText("登录密码"), { target: { value: "Secret!123" } });
  fireEvent.click(screen.getByRole("button", { name: /^登录$/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/password/login", { username: account, password: "Secret!123" }));
  expect(storeCloudbaseSession).toHaveBeenCalledWith(auth);
  expect(screen.getByTestId("location")).toHaveTextContent("/dashboard?tab=spaces");
});
it("requires email, a login username and both password fields when registering", () => {
  page("register");
  for (const label of ["邮箱", "用户名", "设置密码", "确认密码", "邮箱验证码"]) expect(screen.getByLabelText(label)).toBeRequired();
  expect(screen.getByLabelText("用户名")).toHaveAttribute("minLength", "5");
  expect(screen.getByRole("button", { name: "注册并登录" })).toBeDisabled();
});
it("registers with the email challenge and both mandatory credentials", async () => {
  page("register"); fillCredentials();
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "teacher@example.com" } });
  vi.mocked(api.post).mockResolvedValueOnce({ data: { challenge: "email-proof" } }).mockResolvedValueOnce({ data: auth });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/email/code", { email: "teacher@example.com" }));
  fireEvent.change(screen.getByLabelText("邮箱验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "注册并登录" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/email/verify", { challenge: "email-proof", code: "123456", username: "teacher", password: "Secret!123" }));
  expect(storeCloudbaseSession).toHaveBeenCalledWith(auth);
});
it("does not submit mismatched password confirmation", async () => {
  page("register"); fillCredentials();
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "teacher@example.com" } });
  vi.mocked(api.post).mockResolvedValue({ data: { challenge: "email-proof" } });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "注册并登录" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("邮箱验证码"), { target: { value: "123456" } });
  fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Different!123" } });
  fireEvent.click(screen.getByRole("button", { name: "注册并登录" }));
  expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument(); expect(api.post).toHaveBeenCalledTimes(1);
});
it("invalidates the challenge when changing email or mode", async () => {
  page("register");
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "first@example.com" } });
  vi.mocked(api.post).mockResolvedValue({ data: { challenge: "email-proof" } });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "注册并登录" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "other@example.com" } });
  expect(screen.getByRole("button", { name: "注册并登录" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "密码登录" }));
  expect(screen.getByLabelText("登录密码")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "邮箱注册" }));
  expect(screen.getByRole("button", { name: "注册并登录" })).toBeDisabled();
});
it("handles a human CAPTCHA for email registration", async () => {
  page("register");
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "teacher@example.com" } });
  vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { captchaRequired: true, message: "请完成图形验证" } } }).mockResolvedValueOnce({ data: { data: "data:image/gif;base64,R0lGODlh", token: "human" } });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(await screen.findByLabelText("图形验证码")).toBeInTheDocument();
  vi.mocked(api.post).mockResolvedValueOnce({ data: { captchaToken: "solved" } }).mockResolvedValueOnce({ data: { challenge: "email-proof" } });
  fireEvent.change(screen.getByLabelText("图形验证码"), { target: { value: "answer" } });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/auth/email/code", { email: "teacher@example.com", captchaToken: "solved" }));
});
it("requires proof of the old account, not only a phone number, and supports old link URLs", () => {
  page("link"); expect(screen.getByLabelText("原手机号")).toBeRequired();
  expect(screen.getByLabelText("迁移码")).toBeRequired();
  expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "关联并登录" })).toBeDisabled();
});
it.each([false, true])("migrates using an approval or the current original session (session: %s)", async loggedIn => {
  vi.mocked(hasCloudbaseSession).mockReturnValue(loggedIn);
  page("migrate"); fillCredentials(true);
  fireEvent.change(screen.getByLabelText("原手机号"), { target: { value: "13800138000" } });
  fireEvent.change(screen.getByLabelText("新邮箱"), { target: { value: "new@example.com" } });
  if (!loggedIn) fireEvent.change(screen.getByLabelText("迁移码"), { target: { value: "approved" } });
  vi.mocked(api.post).mockResolvedValueOnce({ data: { challenge: "migration-proof" } }).mockResolvedValueOnce({ data: auth });
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/migration/code", { email: "new@example.com", phone: "13800138000", ...(!loggedIn ? { recoveryToken: "approved" } : {}) }));
  fireEvent.change(screen.getByLabelText("邮箱验证码"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "关联并登录" }));
  await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/auth/migration/verify", { challenge: "migration-proof", code: "123456", username: "teacher", password: "Secret!123" }));
  expect(storeCloudbaseSession).toHaveBeenCalledWith(auth);
});
