import { Link, Navigate, Route, Routes } from "react-router-dom";

import { getCurrentUser } from "./auth";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SpaceEntryPage } from "./pages/SpaceEntryPage";
import { SpacePage } from "./pages/SpacePage";
import { UploadPage } from "./pages/UploadPage";

function NavBar() {
  const currentUser = getCurrentUser();

  return (
    <header className="navbar">
      <h1>临时网页部署工具</h1>
      <nav>
        <Link to="/">上传</Link>
        <Link to="/login">登录</Link>
        <Link to="/dashboard">控制台</Link>
        {currentUser?.role === "ADMIN" && <Link to="/admin">管理后台</Link>}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <div className="layout">
      <NavBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
          <Route path="/s/:spaceSlug" element={<SpaceEntryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
