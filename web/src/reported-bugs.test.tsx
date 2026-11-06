// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";
import { UploadPage } from "./pages/UploadPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadDropzone } from "./components/UploadDropzone";

vi.mock("./api", async original => ({ ...await original<any>(), api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, setAuthToken: vi.fn() }));
function signIn() {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("user", JSON.stringify({ id: "owner", username: "teacher", role: "USER" }));
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>; }
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === "/auth/config" ? { provider: "legacy" } : url === "/notifications" ? { notifications: [], next: null } : String(url).endsWith("unread-count") ? { unreadCount: 0 } : [] }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it("lets the author open and copy a successful deployment with a locale-independent expiry", async () => {
  signIn();
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  vi.mocked(api.post).mockResolvedValue({ data: { url: "https://drop.example/p/result", expiresAt: new Date(2099, 10, 13, 9, 5, 24).toISOString() } });
  render(<MemoryRouter><UploadPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "上传到空间" })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("选择 HTML 文件"), { target: { files: [new File(["html"], "index.html", { type: "text/html" })] } });
  await user.click(screen.getByRole("button", { name: "部署" }));
  await user.type(screen.getByRole("textbox", { name: "项目名称" }), "演示");
  await user.click(screen.getByRole("button", { name: "确认部署" }));
  expect(await screen.findByRole("link", { name: "https://drop.example/p/result" })).toHaveAttribute("href", "https://drop.example/p/result");
  expect(screen.getByText("到期：2099-11-13 09:05:24")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "复制部署链接的分享链接" }));
  expect(copy).toHaveBeenCalledWith("https://drop.example/p/result");
});

it("names selected files, including folder-relative paths", () => {
  const entries = ["index.html", "assets/style.css", "app.js"].map(path => ({ path, file: new File(["content"], path.split("/").at(-1)!) }));
  const { rerender } = render(<UploadDropzone entries={entries.slice(0, 1)} onEntriesChange={vi.fn()} />);
  expect(screen.getByText(/已选.*index\.html/)).toBeInTheDocument();
  rerender(<UploadDropzone entries={entries} onEntriesChange={vi.fn()} />);
  for (const entry of entries) expect(screen.getByText(entry.path)).toBeInTheDocument();
});

it("waits for both upload lists before displaying an empty state", async () => {
  signIn();
  let resolve!: (value: { data: never[] }) => void;
  vi.mocked(api.get).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载作品");
  expect(screen.queryByText("你还没有可访问的个人作品。")).not.toBeInTheDocument();
  resolve({ data: [] });
  expect(await screen.findByText("你还没有可访问的个人作品。")).toBeInTheDocument();
});

it("disables destination selection and deployment until the spaces have loaded", async () => {
  signIn();
  let resolve!: (value: { data: any[] }) => void;
  vi.mocked(api.get).mockImplementation(async url => url === "/spaces" ? new Promise(done => { resolve = done; }) : { data: [] });
  render(<MemoryRouter><UploadPage /></MemoryRouter>);
  const select = screen.getByRole("combobox", { name: "上传到空间" });
  expect(select).toBeDisabled(); expect(select).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("option", { name: "加载空间…" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "部署" })).toBeDisabled();
  resolve({ data: [{ id: "space", name: "课程空间", slug: "course", expiresAt: "2099-12-31" }] });
  await screen.findByRole("option", { name: "课程空间" });
  expect(select).not.toBeDisabled(); expect(select).toHaveAttribute("aria-busy", "false");
});

it("redirects a visitor from the dashboard while preserving the complete intended destination", async () => {
  render(<MemoryRouter initialEntries={["/dashboard?tab=messages#unread"]}><App /><Location /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fdashboard%3Ftab%3Dmessages%23unread"));
  expect(screen.queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/deployments");
});

it("returns to the dashboard after login instead of discarding next", async () => {
  const user = userEvent.setup();
  vi.mocked(api.post).mockResolvedValue({ data: { token: "logged-in", user: { id: "owner", username: "teacher", role: "USER" } } });
  render(<MemoryRouter initialEntries={["/login?next=%2Fdashboard%3Ftab%3Dspaces"]}><App /><Location /></MemoryRouter>);
  await user.type(await screen.findByLabelText("用户名"), "teacher");
  await user.type(screen.getByLabelText("密码"), "secret123");
  await user.click(screen.getAllByRole("button", { name: "登录" }).at(-1)!);
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard?tab=spaces"));
});

it("also preserves the intended destination with CloudBase password login", async () => {
  const user = userEvent.setup();
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === "/auth/config" ? { provider: "cloudbase", loginMethod: "sms" } : String(url).endsWith("unread-count") ? { unreadCount: 0 } : [] }));
  vi.mocked(api.post).mockResolvedValue({ data: { token: "fake-access-token", refreshToken: "fake-refresh-token", expiresIn: 3600, user: { id: "owner", username: "teacher", role: "USER" } } });
  render(<MemoryRouter initialEntries={["/login?next=%2Fdashboard%3Ftab%3Dspaces"]}><App /><Location /></MemoryRouter>);
  await user.click(await screen.findByRole("button", { name: "账号密码" }));
  await user.type(screen.getByLabelText("登录账号"), "teacher");
  await user.type(screen.getByLabelText("登录密码"), "Secret!123");
  await user.click(screen.getByRole("button", { name: "登录" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard?tab=spaces"));
});
