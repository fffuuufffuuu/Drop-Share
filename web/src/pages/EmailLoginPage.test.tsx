// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { EmailLoginPage } from "./EmailLoginPage";
vi.mock("../api", () => ({ api: { post: vi.fn() }, setAuthToken: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);
describe("email authentication", () => {
  it("completes an unmapped provider identity with a required username without resending OTP", async () => {
    render(<MemoryRouter><EmailLoginPage method="sms" /></MemoryRouter>);
    vi.mocked(api.post).mockResolvedValueOnce({ data: { challenge: "known-provider", requiresUsername: false } });
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "无效" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(screen.queryByLabelText("用户名")).not.toBeInTheDocument());
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { usernameRequired: true, registrationToken: "verified-provider-session", message: "请填写用户名" } } });
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    expect(await screen.findByLabelText("用户名")).toBeRequired();
    expect(api.post).toHaveBeenCalledWith("/auth/sms/verify", { challenge: "known-provider", code: "123456" });
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "teacher" } });
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { message: "用户名已占用" } } });
    fireEvent.click(screen.getByRole("button", { name: "完成注册" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/registration/complete", { registrationToken: "verified-provider-session", username: "teacher" }));
    expect(api.post).toHaveBeenCalledTimes(3);
  });
  it("requires a registration username and hides it once an existing identity is recognized", async () => {
    render(<MemoryRouter><EmailLoginPage method="sms" /></MemoryRouter>);
    expect(screen.getByLabelText("用户名")).toBeRequired();
    vi.mocked(api.post).mockResolvedValue({ data: { challenge: "existing", requiresUsername: false } });
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(screen.queryByLabelText("用户名")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13900139000" } });
    expect(screen.getByLabelText("用户名")).toBeRequired();
  });
  it("switches between SMS, email and CloudBase password login without reusing OTP challenges", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { challenge: "sms-proof" } });
    render(<MemoryRouter><EmailLoginPage method="sms" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "验证并登录" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "邮箱验证码" }));
    expect(screen.getByLabelText("邮箱")).toHaveValue("");
    expect(screen.getByRole("button", { name: "验证并登录" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "账号密码" }));
    fireEvent.change(screen.getByLabelText("登录账号"), { target: { value: "teacher" } });
    fireEvent.change(screen.getByLabelText("登录密码"), { target: { value: "Secret!123" } });
    vi.mocked(api.post).mockRejectedValue({ response: { data: { message: "用户名或密码错误" } } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/password/login", { username: "teacher", password: "Secret!123" }));
  });
  it("shows a CAPTCHA to the user when the provider requires one",async()=>{
    vi.mocked(api.post).mockRejectedValueOnce({response:{data:{message:"请完成图形验证",captchaRequired:true}}}).mockResolvedValueOnce({data:{data:"data:image/gif;base64,R0lGODlh",token:"human-challenge"}});
    render(<MemoryRouter><EmailLoginPage method="sms"/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("手机号"),{target:{value:"13800138000"}});
    fireEvent.click(screen.getByRole("button",{name:"获取验证码"}));
    expect(await screen.findByLabelText("图形验证码")).toBeInTheDocument();
    expect(screen.getByAltText("请识别图中的验证码")).toBeInTheDocument();
    vi.mocked(api.post).mockResolvedValueOnce({data:{captchaToken:"human-proof"}}).mockResolvedValueOnce({data:{challenge:"sms-proof"}});
    fireEvent.change(screen.getByLabelText("图形验证码"),{target:{value:"mock-answer"}});
    fireEvent.click(screen.getByRole("button",{name:"获取验证码"}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/auth/sms/code",{phone:"13800138000",captchaToken:"human-proof"}));
  });
  it("uses the SMS endpoint when configured for phone verification", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { challenge: "sms-proof", expiresIn: 600 } });
    render(<MemoryRouter><EmailLoginPage method="sms" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/sms/code", { phone: "13800138000" }));
  });
  it("discards a verification challenge when the email changes", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { challenge: "opaque", expiresIn: 600 } });
    render(<MemoryRouter><EmailLoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "first@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "验证并登录" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "other@example.com" } });
    expect(screen.getByRole("button", { name: "验证并登录" })).toBeDisabled();
  });
  it("explains that old accounts must be linked to retain their content", () => {
    render(<MemoryRouter><EmailLoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "关联旧账号" }));
    expect(screen.getByLabelText("原用户名")).toBeInTheDocument();
    expect(screen.getByLabelText("原密码")).toBeInTheDocument();
    expect(screen.getByText(/保留原有作品、空间和权限/)).toBeInTheDocument();
  });
});
