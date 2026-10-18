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
