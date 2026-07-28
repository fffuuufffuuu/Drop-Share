import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, setAuthToken } from "../api";
import type { Space } from "../types";

export function DashboardPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");

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
    void loadSpaces();
  }, []);

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

  return (
    <section className="card">
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
      <p className="message">{message}</p>
      <ul>
        {spaces.map((space) => (
          <li key={space.id}>
            <strong>{space.name}</strong> / {space.slug} -{" "}
            <Link to={`/spaces/${space.id}`}>进入管理</Link> -{" "}
            <Link to={`/s/${space.slug}`}>入口页面</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
