import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser, notifyAuthChanged } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
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

export function getSpaceStatus(space: Space, now = new Date()): "有效" | "已过期" {
  return new Date(space.expiresAt) > now ? "有效" : "已过期";
}

export function DashboardPage() {
  const [activePanel, setActivePanel] = useState<DashboardPanel>("uploads");
  const [deployments, setDeployments] = useState<PersonalDeployment[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
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
      const { data } = await api.get<Space[]>("/spaces");
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken();
    notifyAuthChanged();
    navigate("/login");
  }

  async function extendSpace(spaceId: string) {
    try {
      const { data } = await api.post<Space>(`/spaces/${spaceId}/extend`);
      setSpaces((current) => current.map((space) => (
        space.id === spaceId
          ? { ...space, ...data, deploymentCount: space.deploymentCount }
          : space
      )));
      setMessage("空间到期时间已从现在起延长一年");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "延长空间期限失败");
    }
  }

  async function deleteSpace(space: Space) {
    if (!confirm("此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？")) {
      return;
    }
    try {
      await api.delete(`/spaces/${space.id}`);
      setSpaces((current) => current.filter((item) => item.id !== space.id));
      setMessage("空间及其中全部作品已永久删除");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除空间失败");
    }
  }

  return (
    <section className="card dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">个人控制台</p>
          <h2>{getCurrentUser()?.username ?? "当前用户"}</h2>
        </div>
        <button type="button" onClick={logout}>退出登录</button>
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
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>网页</th>
                    <th>上传时间</th>
                    <th>到期时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((deployment) => {
                    const status = getPersonalDeploymentStatus(deployment);
                    return (
                      <tr key={deployment.id}>
                        <td>{deployment.title}</td>
                        <td>{new Date(deployment.createdAt).toLocaleString()}</td>
                        <td>{new Date(deployment.expiresAt).toLocaleString()}</td>
                        <td>
                          <span
                            className={`dashboard-status dashboard-status-${statusClassNames[status]}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          {status === "正常" ? (
                            <a
                              href={`/p/${deployment.publicSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`访问${deployment.title}`}
                            >
                              访问
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activePanel === "spaces" && (
        <div className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2>空间管理</h2>
              <p className="hint">在一个空间里分享所有人的作品</p>
            </div>
            <button type="button" onClick={() => setCreateSpaceOpen(true)}>
              新建空间
            </button>
          </div>
          {spaces.length === 0 ? (
            <p className="hint">还没有空间，点击“新建空间”开始创建。</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>空间名称</th>
                    <th>网址后缀</th>
                    <th>作品数量</th>
                    <th>到期时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((space) => {
                    const status = getSpaceStatus(space);
                    return (
                      <tr key={space.id}>
                        <td><strong>{space.name}</strong></td>
                        <td>/{space.slug}</td>
                        <td>{space.deploymentCount}</td>
                        <td>{new Date(space.expiresAt).toLocaleString()}</td>
                        <td>
                          <span
                            className={`dashboard-status dashboard-status-${
                              status === "有效" ? "active" : "expired"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          <div className="dashboard-space-actions">
                            {status === "有效" && (
                              <>
                              <Link to={`/spaces/${space.id}`}>进入管理</Link>
                              <Link to={`/s/${space.slug}`}>入口页面</Link>
                              <button
                                type="button"
                                onClick={() => void extendSpace(space.id)}
                              >
                                延长一年
                              </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="dashboard-delete-space"
                              aria-label={`删除${space.name}`}
                              onClick={() => void deleteSpace(space)}
                            >
                              删除空间
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CreateSpaceModal
        open={createSpaceOpen}
        onClose={() => setCreateSpaceOpen(false)}
        onCreated={(space) => {
          setSpaces((current) => [...current, space]);
          setCreateSpaceOpen(false);
          setMessage("空间创建成功");
        }}
      />
    </section>
  );
}
