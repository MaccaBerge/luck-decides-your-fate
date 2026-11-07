import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import * as adminApi from "./adminApi";
import { errorStatus } from "./adminApi";
import { AdminAuthContext, type AdminAuth } from "./auth";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import LinkControlPage from "./LinkControlPage";
import AnalyticsPage from "./analytics/AnalyticsPage";

type AuthState = "checking" | "in" | "out";

export default function AdminApp() {
  const [auth, setAuth] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    adminApi
      .me()
      .then(() => !cancelled && setAuth("in"))
      .catch(() => !cancelled && setAuth("out"));
    return () => {
      cancelled = true;
    };
  }, []);

  const onUnauthorized = useCallback(() => setAuth("out"), []);
  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch (err) {
      if (errorStatus(err) !== 401) console.warn("logout failed", err);
    }
    setAuth("out");
  }, []);
  const ctx = useMemo<AdminAuth>(() => ({ onUnauthorized, logout }), [onUnauthorized, logout]);

  let content;
  if (auth === "checking") {
    content = (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" aria-label="Loading" />
      </div>
    );
  } else if (auth === "out") {
    content = <LoginPage onLoggedIn={() => setAuth("in")} />;
  } else {
    content = (
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="links/:gameId" element={<LinkControlPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    );
  }

  return (
    <AdminAuthContext.Provider value={ctx}>
      <div className="min-h-dvh bg-bg text-ink">
        {content}
      </div>
    </AdminAuthContext.Provider>
  );
}
