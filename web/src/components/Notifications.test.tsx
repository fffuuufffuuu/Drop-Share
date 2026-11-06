// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AccountSettings } from "./AccountSettings";
import { NotificationsPanel, NotificationsProvider, useNotifications } from "./Notifications";
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
const item = { id: "n1", kind: "comment", title: "《圆周运动》收到新评论", content: "同学：很有帮助", href: "/s/physics?work=d1", createdAt: "2026-11-05T00:00:00Z", readAt: null };
function Count() { return <p data-testid="count">{useNotifications().unreadCount}</p>; }
function Location() { const location = useLocation(); return <p data-testid="location">{location.pathname + location.search}</p>; }
it("opens a read message without waiting for a slow unread count refresh", async () => {
  localStorage.setItem("token", "test"); let slow = false;
  vi.spyOn(api, "get").mockImplementation(async url => {
    if (String(url).endsWith("unread-count")) return slow ? new Promise(() => {}) : { data: { unreadCount: 1 } };
    return { data: { notifications: [item], next: null } };
  });
  vi.spyOn(api, "patch").mockImplementation(async () => { slow = true; return {}; });
  render(<MemoryRouter><NotificationsProvider userId="u1"><Location /><NotificationsPanel /></NotificationsProvider></MemoryRouter>);
  await userEvent.click(await screen.findByRole("link", { name: "查看作品和评论" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/s/physics?work=d1"));
});
it("shows persisted unread counts and refreshes them when a notification is read", async () => {
  localStorage.setItem("token", "test"); let unread = 1;
  vi.spyOn(api, "get").mockImplementation(async url => ({ data: String(url).endsWith("unread-count") ? { unreadCount: unread } : { notifications: [item], next: null } }));
  const patch = vi.spyOn(api, "patch").mockImplementation(async () => { unread = 0; return {}; });
  render(<MemoryRouter><NotificationsProvider userId="u1"><Count /><NotificationsPanel /></NotificationsProvider></MemoryRouter>);
  expect(await screen.findByText(item.title)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
  expect(screen.getByRole("link", { name: "查看作品和评论" })).toHaveAttribute("href", "/s/physics?work=d1");
  await userEvent.click(screen.getByRole("button", { name: "标为已读" }));
  await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));
  expect(patch).toHaveBeenCalledWith("/notifications/n1/read");
  expect(screen.queryByText("未读", { exact: true })).not.toBeInTheDocument();
});
it("shows account fields in columns and links missing bindings to the verification flow", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { username: "昵称", loginUsername: "login_name", phone: "13800000000", email: "" } });
  render(<MemoryRouter><AccountSettings /></MemoryRouter>);
  await screen.findByText("login_name"); expect(screen.getByText("昵称", { selector: "dd span" })).toBeInTheDocument();
  expect(screen.getByText("13800000000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "绑定邮箱" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "绑定手机号" })).not.toBeInTheDocument();
});
it("keeps an unread message and exposes a retry if marking it read fails", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { notifications: [item], next: null } });
  vi.spyOn(api, "patch").mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><NotificationsPanel /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "标为已读" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("标记已读失败");
  expect(screen.getByText("未读", { exact: true })).toBeInTheDocument();
});
