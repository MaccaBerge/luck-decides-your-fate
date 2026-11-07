import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import NotFoundPage from "./pages/NotFoundPage";
import PrivacyPage from "./pages/PrivacyPage";

const AdminApp = lazy(() => import("./admin/AdminApp"));
// useLayoutEffect scrolls before the first paint; it warns during server rendering (tests), so fall back there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Start each newly opened page at the top. Back/forward (POP) keeps the browser's own scroll restore. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useIsoLayoutEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/g/:gameId" element={<GamePage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  );
}
