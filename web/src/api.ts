import axios from "axios";

import { notifyAuthChanged } from "./auth";
import { clearCloudbaseSession, hasCloudbaseSession, needsCloudbaseRefresh, refreshCloudbaseSession } from "./cloudbase-session";
import type { AuthResponse } from "./types";

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

const sessionApi = axios.create({baseURL:getApiBaseURL(),timeout:15000});
api.interceptors.request.use(async request=>{
  if (request.url?.startsWith("/auth/")) {delete request.headers.Authorization;return request;}
  if (needsCloudbaseRefresh()) {
    try {
      const token=await refreshCloudbaseSession(async refreshToken=>(await sessionApi.post<AuthResponse>("/auth/refresh",{refreshToken})).data,
        error=>axios.isAxiosError(error) && !!error.response && error.response.status<500 && error.response.status!==429);
      if(!token) throw new Error("登录状态已变化，请重新操作");
    } catch(error) {
      // A network outage must not log the user out or silently turn their upload anonymous.
      setAuthToken(localStorage.getItem("token")??undefined);
      throw error;
    }
  }
  const token=localStorage.getItem("token");
  if (token) request.headers.Authorization=`Bearer ${token}`;
  else delete request.headers.Authorization;
  return request;
});

export async function logoutSession():Promise<void> {
  const token=localStorage.getItem("token");const cloudbase=hasCloudbaseSession();
  clearCloudbaseSession();setAuthToken();notifyAuthChanged();
  if (cloudbase && token) {
    try {await sessionApi.post("/auth/logout",{}, {headers:{Authorization:`Bearer ${token}`}});} catch { /* Local logout still completes when the provider is unreachable. */ }
  }
}

export function setAuthToken(token?: string): void {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

interface ApiErrorShape {
  config?: {headers?:{Authorization?:unknown}};
  response?: {
    status?: number;
    data?: { message?: string };
  };
}

export function handleResponseError(error: unknown): Promise<never> {
  const { response } = (error ?? {}) as ApiErrorShape;
  const sentAuthorization=(error as ApiErrorShape)?.config?.headers?.Authorization;
  if(typeof sentAuthorization==="string" && sentAuthorization!==`Bearer ${localStorage.getItem("token")}`) return Promise.reject(error);
  if (
    response?.status === 401
    && response.data?.message === "Invalid token"
    && localStorage.getItem("token")
  ) {
    clearCloudbaseSession();
    setAuthToken();
    notifyAuthChanged();
    response.data.message = "登录已过期，请重新登录";
  }
  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, handleResponseError);
