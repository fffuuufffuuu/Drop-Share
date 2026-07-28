import axios from "axios";

// 运行时判断：在 localhost 开发时连 4000，部署到域名后自动用同域 /api
function getApiBaseURL(): string {
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return "http://localhost:4000/api";
  }
  return import.meta.env.VITE_API_BASE_URL || "/api";
}

export const api = axios.create({
  baseURL: getApiBaseURL(),
});

export function setAuthToken(token?: string): void {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}
