import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser, notifyAuthChanged } from "../auth";
import type { PersonalDeployment, Space } from "../types";

type DashboardPanel = "uploads" | "spaces";
type PersonalDeploymentStatus = "正常" | "已隐藏" | "已过期" | "已删除";

const statusClassNames: Record<PersonalDeploymentStatus, string> = {
  正常: "active",
  已隐藏: "hidden",
  已过期: "expired",
  已删除: "deleted",
};

export function getPersonalDeploymentStatus(
  deployment: PersonalDeployment,
  now = new Date(),
): PersonalDeploymentStatus {
  if (deployment.deletedAt) return "已删除";
  if (new Date(deployment.expiresAt) <= now) return "已过期";
  if (deployment.visibility === "hidden") return "已隐藏";
  return "正常";
}

export function DashboardPage() {
  const [activePanel, setActivePanel] = useState<DashboardPanel>("uploads");
  const [deployments, setDeployments] = useState<PersonalDeployment[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function loadDeployments() {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    try {
      const { data } = await api.get<PersonalDeployment[]>("/deployments");
      setDeployments(data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载个人上传失败");
    }
  }

  async function loadSpaces() {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    try {
      const { data } = await api.get("/spaces");
      setSpaces(data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载空间失败");
    }
  }

  useEffect(() => {
    setMessage("");
    if (activePanel === "uploads") {
      void loadDeployments();
    } else {
      void loadSpaces();
    }
  }, [activePanel]);

  async function createSpace() {
    try {
      const { data } = await api.post("/spaces", { name, slug: slug || undefined });
      setMessage(`创建成功：入口 ${data.entryUrl}`);
      setName("");
      setSlug("");
      await loadSpaces();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "创建失败");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken();
    notifyAuthChanged();
    navigate("/login");
  }

  return (
    <section className="card dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">个人控制台</p>
          <h2>{getCurrentUser()?.username ?? "当前用户"}</h2>
        </div>
        <button type="button" onClick={logout}>
          退出登录
        </button>
      </header>

      <div className="dashboard-tabs" role="tablist" aria-label="控制台板块">
        <button
          type="button"
          className={activePanel === "uploads" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("uploads")}
        >
          我的上传
        </button>
        <button
          type="button"
          className={activePanel === "spaces" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("spaces")}
        >
          空间管理
        </button>
      </div>

      {message && <p className="message dashboard-message">{message}</p>}

      {activePanel === "uploads" && (
        <div className="dashboard-panel">
          <h2>我的上传</h2>
          <p className="hint">
            这里保留登录后直接上传的个人网页历史，不包含匿名上传或空间网页。
          </p>
          {deployments.length === 0 ? (
            <p className="hint">还没有个人上传记录。</p>
          ) : (
            <div className="deployment-list">
              {deployments.map((deployment) => {
                const status = getPersonalDeploymentStatus(deployment);
                return (
                  <article className="dashboard-deployment" key={deployment.id}>
                    <div>
                      <h3>{deployment.title}</h3>
                      <p>
                        上传：{new Date(deployment.createdAt).toLocaleString()}
                        {" · "}
                        到期：{new Date(deployment.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="dashboard-deployment-actions">
                      <span
                        className={`dashboard-status dashboard-status-${statusClassNames[status]}`}
                      >
                        {status}
                      </span>
                      {status === "正常" && (
                        <a
                          href={`/p/${deployment.publicSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`访问${deployment.title}`}
                        >
                          访问
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activePanel === "spaces" && (
        <div className="dashboard-panel">
          <h2>空间管理</h2>
          <div className="row">
            <label>
              空间名称
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              自定义 slug
              <input value={slug} onChange={(event) => setSlug(event.target.value)} />
            </label>
          </div>
          <button onClick={createSpace} type="button">
            创建空间
          </button>
          <ul>
            {spaces.map((space) => (
              <li key={space.id}>
                <strong>{space.name}</strong> / {space.slug} -{" "}
                <Link to={`/spaces/${space.id}`}>进入管理</Link> -{" "}
                <Link to={`/s/${space.slug}`}>入口页面</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
