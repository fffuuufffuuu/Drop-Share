import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { collectUploadEntries } from "../uploader";
import type { Deployment } from "../types";

type SpaceDetail = {
  id: string;
  name: string;
  slug: string;
  expiresAt: string;
  deployments: Deployment[];
};

export function SpacePage() {
  const { spaceId } = useParams();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<ReturnType<typeof collectUploadEntries>>([]);

  async function loadDetail() {
    if (!spaceId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    const { data } = await api.get(`/spaces/${spaceId}`);
    setDetail(data);
  }

  useEffect(() => {
    void loadDetail();
  }, [spaceId]);

  async function toggleVisibility(id: string, value: "visible" | "hidden") {
    try {
      await api.patch(`/deployments/${id}`, { visibility: value });
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "修改失败");
    }
  }

  async function removeDeployment(id: string) {
    try {
      await api.delete(`/deployments/${id}`);
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除失败");
    }
  }

  async function batchUpload() {
    if (!spaceId || !entries.length) return;
    const formData = new FormData();
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    try {
      const { data } = await api.post(`/spaces/${spaceId}/deployments/batch-upload`, formData);
      setMessage(`批量部署完成，共 ${data.count} 个项目`);
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "批量部署失败");
    }
  }

  return (
    <section className="card">
      <h2>空间项目管理</h2>
      {detail ? (
        <>
          <p>
            空间：<strong>{detail.name}</strong> / {detail.slug}
          </p>
          <p className="retention-note retention-note--user">
            空间内作品统一于 {new Date(detail.expiresAt).toLocaleString()} 到期
          </p>
          <label className="upload-box">
            <input
              type="file"
              // @ts-expect-error webkitdirectory is available in Chromium-based browsers
              webkitdirectory="true"
              multiple
              onChange={(event) => setEntries(collectUploadEntries(event.target.files))}
            />
          </label>
          <button type="button" onClick={batchUpload}>
            批量上传到空间
          </button>
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>可见性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {detail.deployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td>{deployment.title}</td>
                  <td>{deployment.visibility}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        toggleVisibility(
                          deployment.id,
                          deployment.visibility === "visible" ? "hidden" : "visible",
                        )
                      }
                    >
                      显示/隐藏
                    </button>
                    <button type="button" onClick={() => removeDeployment(deployment.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>加载中...</p>
      )}
      <p className="message">{message}</p>
    </section>
  );
}
