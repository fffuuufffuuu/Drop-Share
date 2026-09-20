import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { authChangedEvent, getCurrentUser } from "./auth";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SpaceEntryPage } from "./pages/SpaceEntryPage";
import { SpacePage } from "./pages/SpacePage";
import { UploadPage } from "./pages/UploadPage";
import type { CurrentUser } from "./types";

function NavBar({ currentUser }: { currentUser: CurrentUser | null }) {
  return (
    <header className="navbar">
      <Link className="navbar-brand" to="/">
        Drop <span>&amp;</span> Share
      </Link>
      <nav>
        <Link to="/upload">{currentUser ? "上传" : "免费使用"}</Link>
        {currentUser ? (
          <Link className="navbar-my-works" to="/dashboard">我的作品</Link>
        ) : (
          <Link to="/login">登录/注册</Link>
        )}
      </nav>
    </header>
  );
}

function SiteFooter({ currentUser }: { currentUser: CurrentUser | null }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>作者：<strong>CashewLab</strong></p>
        <div className="site-footer-links">
          <a href="https://github.com/fffuuufffuuu" target="_blank" rel="noreferrer">
            GitHub 主页
          </a>
          {currentUser?.role === "ADMIN" && (
            <Link className="site-footer-admin" to="/admin">管理后台</Link>
          )}
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser);

  useEffect(() => {
    const refreshCurrentUser = () => setCurrentUser(getCurrentUser());
    window.addEventListener(authChangedEvent, refreshCurrentUser);
    window.addEventListener("storage", refreshCurrentUser);
    return () => {
      window.removeEventListener(authChangedEvent, refreshCurrentUser);
      window.removeEventListener("storage", refreshCurrentUser);
    };
  }, []);

  return (
    <div className="layout">
      <NavBar currentUser={currentUser} />
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
          <Route path="/s/:spaceSlug" element={<SpaceEntryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter currentUser={currentUser} />
    </div>
  );
}
