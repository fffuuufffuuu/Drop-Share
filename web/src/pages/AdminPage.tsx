import { getCurrentUser } from "../auth";

export function AdminPage() {
  const currentUser = getCurrentUser();

  if (currentUser?.role !== "ADMIN") {
    return (
      <section className="card">
        <h2>仅管理员可访问</h2>
        <p>请使用管理员账号登录后再试。</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>管理后台</h2>
      <p>当前管理员：{currentUser.username}</p>
    </section>
  );
}
