import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { authChangedEvent, getCurrentUser } from "./auth";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SpaceEntryPage } from "./pages/SpaceEntryPage";
import { SpacePage } from "./pages/SpacePage";
import { UploadPage } from "./pages/UploadPage";
import type { CurrentUser } from "./types";
import { ThemeToggle } from "./components/ThemeToggle";
import { NotificationsProvider, UnreadDot, useNotifications } from "./components/Notifications";

function NavBar({ currentUser }: { currentUser: CurrentUser | null }) {
  const { unreadCount } = useNotifications();
  return (
    <header className="navbar">
      <Link className="navbar-brand" to="/">
        <img className="navbar-logo" src="/logo.svg" alt="" aria-hidden="true" />
        <span className="navbar-brand-text">Drop <span>&amp;</span> Share</span>
      </Link>
      <nav>
        <ThemeToggle />
        <Link to="/upload">{currentUser ? "上传" : "免费使用"}</Link>
        {currentUser ? (
          <Link className="navbar-my-works" to="/dashboard" title={unreadCount ? `${unreadCount} 条未读消息` : undefined}>我的<UnreadDot count={unreadCount} /></Link>
        ) : (
          <Link to="/login">登录/注册</Link>
        )}
      </nav>
    </header>
  );
}

function AccountRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search); params.set("tab", "account");
  return <Navigate replace to={{ pathname: "/dashboard", search: `?${params}`, hash: location.hash }} />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!getCurrentUser() || !localStorage.getItem("token")) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={`/login?next=${encodeURIComponent(next)}`} />;
  }
  return children;
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>作者：<a className="site-footer-author" href="https://www.yaoguosir.com/" target="_blank" rel="noreferrer">CashewLab</a></p>
        <p className="site-footer-record">沪ICP备2025130631号-1</p>
        <div className="site-footer-links">
          <a href="https://github.com/fffuuufffuuu/Drop-Share" target="_blank" rel="noreferrer">
            GitHub
          </a>
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
    <NotificationsProvider key={currentUser?.id ?? "guest"} userId={currentUser?.id}><div className="layout">
      <NavBar currentUser={currentUser} />
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/account" element={<AccountRedirect />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
          <Route path="/s/:spaceSlug" element={<SpaceEntryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div></NotificationsProvider>
  );
}
