// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, handleResponseError, setAuthToken } from "./api";
import { authChangedEvent } from "./auth";

describe("handleResponseError", () => {
  it("sends the current bearer only to authenticated account settings, never to public auth", async () => {
    localStorage.setItem("token", "current-session");
    const seen: Record<string, unknown>[] = [];
    const adapter = async (request: any) => { seen.push({ url: request.url, authorization: request.headers.Authorization }); return { data: {}, status: 200, statusText: "OK", headers: {}, config: request }; };
    await api.get("/auth/account", { adapter });
    await api.post("/auth/account/proof/code", { method: "sms" }, { adapter });
    await api.post("/auth/password/login", {}, { adapter });
    expect(seen).toEqual([
      { url: "/auth/account", authorization: "Bearer current-session" },
      { url: "/auth/account/proof/code", authorization: "Bearer current-session" },
      { url: "/auth/password/login", authorization: undefined },
    ]);
  });
  beforeEach(() => {
    localStorage.clear();
    setAuthToken();
  });

  it("登录凭证失效时清除本地登录状态并提示重新登录", async () => {
    localStorage.setItem("token", "expired-token");
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "u1", username: "fffuuu", role: "ADMIN" }),
    );
    setAuthToken("expired-token");
    const listener = vi.fn();
    window.addEventListener(authChangedEvent, listener);

    const error = { response: { status: 401, data: { message: "Invalid token" } } };
    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(error.response.data.message).toBe("登录已过期，请重新登录");

    window.removeEventListener(authChangedEvent, listener);
  });

  it("其他错误保持原样，不影响登录状态", async () => {
    localStorage.setItem("token", "valid-token");

    const error = { response: { status: 400, data: { message: "用户名或密码错误" } } };
    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBe("valid-token");
    expect(error.response.data.message).toBe("用户名或密码错误");
  });
  it("旧请求的失效响应不会清除后来建立的新会话",async()=>{
    localStorage.setItem("token","new-session");
    const error={config:{headers:{Authorization:"Bearer old-session"}},response:{status:401,data:{message:"Invalid token"}}};
    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(localStorage.getItem("token")).toBe("new-session");
  });
});
