import { Navigate, useLocation } from "react-router-dom";

import { isAuthenticated, loginPathWithNext } from "./auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to={loginPathWithNext(location.pathname)} replace />;
  }
  return children;
}
