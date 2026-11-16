// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AccountSettings } from "./AccountSettings";
vi.mock("../api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.get).mockResolvedValue({ data: { username: "teacher", loginUsername: "teacher", phone: "+86 13800138000", email: "old@example.com" } }); });
it("keeps credential changes disabled until the bound identity has passed step-up verification", async () => {
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "修改密码" }));
  expect(screen.getByLabelText("新密码")).toBeDisabled();
  vi.mocked(api.post).mockResolvedValueOnce({ data: { challenge: "current-sub-challenge" } }).mockResolvedValueOnce({ data: { proof: "step-up-proof" } });
  fireEvent.click(screen.getAllByRole("button", { name: "获取验证码" })[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/account/proof/code", { method: "email" }));
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
it("shows only icon controls until an operation is selected and updates the nickname", async () => {
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  const edit = await screen.findByRole("button", { name: "修改昵称" });
  expect(edit.textContent).toBe(""); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(edit);
  vi.mocked(api.post).mockResolvedValue({ data: { username: "物理老师" } });
  fireEvent.change(screen.getByLabelText("新昵称"), { target: { value: "物理老师" } });
  fireEvent.click(screen.getByRole("button", { name: "保存昵称" }));
  expect(await screen.findByText("昵称已修改")).toBeInTheDocument();
  expect(screen.getByText("物理老师")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByLabelText("新昵称")).not.toBeInTheDocument());
});
it("opens rebind directly without a dialog and retains the bound contact", async () => {
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "重新绑定邮箱" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "解绑邮箱" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("新邮箱")).toBeDisabled();
  expect(screen.getByText("+86 13800138000")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("displays the login username without changing it when editing the password", async () => {
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "修改密码" }));
  expect(screen.getByText("登录用户名")).toBeInTheDocument();
  expect(screen.queryByText("设置登录用户名")).not.toBeInTheDocument();
  expect(screen.getByText("密码", { selector: "dt" })).toBeInTheDocument();
});

it("guides phone-only users to migration instead of sending an SMS", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { username: "teacher", phone: "+86 13800138000", email: "" } });
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "修改密码" }));
  expect(screen.getByRole("link", { name: "关联旧账号并验证新邮箱" })).toHaveAttribute("href", "/login?mode=migrate");
  expect(screen.queryByRole("button", { name: "获取验证码" })).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("uploads a new avatar and updates the account and navbar session cache", async () => {
  localStorage.setItem("user", JSON.stringify({ id: "u", username: "teacher", role: "USER" }));
  vi.mocked(api.post).mockResolvedValue({ data: { avatarUrl: "https://example.com/avatar.webp" } });
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  const input = await screen.findByLabelText("选择头像");
  fireEvent.change(input, { target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: "保存头像" }));
  expect(await screen.findByText("头像已更新")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/auth/account/avatar", { mimeType: "image/png", data: "aW1hZ2U=" });
  expect(screen.getByAltText("当前头像")).toHaveAttribute("src", "https://example.com/avatar.webp");
  expect(JSON.parse(localStorage.getItem("user")!)).toHaveProperty("avatarUrl", "https://example.com/avatar.webp");
  localStorage.clear();
});
it("rejects unsupported files and displays profile update failures", async () => {
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  const input = await screen.findByLabelText("选择头像");
  fireEvent.change(input, { target: { files: [new File(["svg"], "a.svg", { type: "image/svg+xml" })] } });
  fireEvent.click(screen.getByRole("button", { name: "保存头像" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请选择不超过 2 MiB");
  expect(api.post).not.toHaveBeenCalled();
  vi.mocked(api.post).mockRejectedValue({ response: { data: { message: "头像保存未确认" } } });
  fireEvent.change(input, { target: { files: [new File(["png"], "a.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: "保存头像" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("头像保存未确认"));
});
