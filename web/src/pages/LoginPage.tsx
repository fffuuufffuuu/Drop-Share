import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { notifyAuthChanged } from "../auth";
import type { AuthResponse } from "../types";

type Mode = "login" | "register";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "register" ? "register" : "login",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const requestedNext = searchParams.get("next");
  const destination = requestedNext === "/upload?createSpace=1"
    ? requestedNext
    : "/upload";

  async function handleLogin() {
    try {
      const { data } = await api.post<AuthResponse>("/auth/login", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setAuthToken(data.token);
      notifyAuthChanged();
      setMessage("登录成功");
      navigate(destination);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "登录失败");
    }
  }

  async function handleRegister() {
    if (password.length < 8) {
      setMessage("密码至少需要 8 个字符");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }
    try {
      const { data } = await api.post<AuthResponse>("/auth/register", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setAuthToken(data.token);
      notifyAuthChanged();
      setMessage("注册并登录成功");
      navigate(destination);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "注册失败");
    }
  }

  return (
    <section className="card">
      <h2>{mode === "login" ? "账号密码登录" : "账号注册"}</h2>
      <div className="auth-mode-switch" role="group" aria-label="登录或注册">
        <button
          type="button"
          className={mode === "login" ? "auth-mode-active" : undefined}
          aria-pressed={mode === "login"}
          onClick={() => setMode("login")}
        >
          登录
        </button>
        <button
          type="button"
          className={mode === "register" ? "auth-mode-active" : undefined}
          aria-pressed={mode === "register"}
          onClick={() => setMode("register")}
        >
          注册
        </button>
      </div>
      <label>
        用户名
        <input value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label>
        密码
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          placeholder={mode === "register" ? "至少 8 位" : undefined}
        />
        {mode === "register" && <span className="hint">至少 8 个字符</span>}
      </label>
      {mode === "register" && (
        <label>
          确认密码
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
      )}
      <div className="row">
        {mode === "login" ? (
          <button className="auth-submit" onClick={handleLogin} type="button">
            登录
          </button>
        ) : (
          <button className="auth-submit" onClick={handleRegister} type="button">
            注册并登录
          </button>
        )}
      </div>
      <p className="message">{message}</p>
    </section>
  );
}
