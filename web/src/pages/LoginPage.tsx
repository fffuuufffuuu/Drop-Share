import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, setAuthToken } from "../api";

type Mode = "login" | "register";

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function handleLogin() {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setAuthToken(data.token);
      setMessage("登录成功");
      navigate("/dashboard");
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
      const { data } = await api.post("/auth/register", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setAuthToken(data.token);
      setMessage("注册并登录成功");
      navigate("/dashboard");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "注册失败");
    }
  }

  return (
    <section className="card">
      <h2>{mode === "login" ? "账号密码登录" : "账号注册"}</h2>
      <div className="row">
        <button
          type="button"
          onClick={() => setMode("login")}
          style={{ opacity: mode === "login" ? 1 : 0.6 }}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          style={{ opacity: mode === "register" ? 1 : 0.6 }}
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
          <button onClick={handleLogin} type="button">
            登录
          </button>
        ) : (
          <button onClick={handleRegister} type="button">
            注册并登录
          </button>
        )}
      </div>
      <p className="message">{message}</p>
    </section>
  );
}
