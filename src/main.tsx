import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Onboarding } from "@/components/Onboarding";
import { QueryProvider } from "@/components/QueryProvider";
import { isOnboarded } from "@/lib/onboarding";
import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Static imports — the app ships INSIDE the APK and is served from localhost,
// so code-splitting only adds boot-time fetch round-trips (and a possible
// eternal loading screen if a chunk stalls). One bundle, instant paint.
import AuthPage from "./pages/Auth.tsx";
import ChatPage from "./pages/ChatPage.tsx";
import SkillsPage from "./pages/SkillsPage.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import AppForge from "./pages/AppForge.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";
import Debug from "./pages/Debug.tsx";
import DagestanShell from "./pages/DagestanShell.tsx";
import Models from "./pages/Models.tsx";
import Marketplace from "./pages/Marketplace.tsx";
import Services from "./pages/Services.tsx";



// Installable PWA: register the offline shell service worker ONLY on https
// origins. Inside the Android app everything is already local (localhost
// origin) — a service worker there would just add cache-related failure modes.
// Safety net: catch unhandled promise rejections so they never crash the
// React tree or kick the user out of the app.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[Dagestan] Unhandled promise rejection:", e.reason);
    // Forward to local telemetry buffer (no upload by default).
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    import("@/lib/telemetry").then(({ logError }) => logError("unhandledrejection", reason));
    e.preventDefault();
  });
  window.addEventListener("error", (e) => {
    console.error("[Dagestan] Uncaught error:", e.error);
    const msg = e.error instanceof Error ? e.error.message : (e.message ?? "");
    import("@/lib/telemetry").then(({ logError }) => logError("window.error", msg, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    }));
    e.preventDefault();
  });
}

if (
  import.meta.env.PROD &&
  typeof window !== "undefined" &&
  window.location.protocol === "https:" &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(() => !isOnboarded());
  if (show) return <Onboarding onComplete={() => setShow(false)} />;
  return <>{children}</>;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>      <ErrorBoundary fallbackTitle="Dagestan crashed">
      <QueryProvider>
      <OnboardingGate>
      <BrowserRouter>
        <RouteSyncer />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/auth"
            element={<AuthPage redirectAfterAuth="/chat" />}
          />
          <Route path="/chat" element={<Protected><ChatPage /></Protected>} />
          <Route path="/chat/:chatId" element={<Protected><ChatPage /></Protected>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/forge" element={<Protected><AppForge /></Protected>} />
          <Route path="/skills" element={<Protected><SkillsPage /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/shell" element={<Protected><DagestanShell /></Protected>} />
          <Route path="/models" element={<Protected><Models /></Protected>} />
          <Route path="/marketplace" element={<Protected><Marketplace /></Protected>} />
          <Route path="/services" element={<Protected><Services /></Protected>} />
          <Route path="/debug" element={<Debug />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </OnboardingGate>
      </QueryProvider>
      <Toaster />      </ErrorBoundary>
  </StrictMode>,
);
