import React, { useEffect, useState } from "react";

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const CHECK_EVERY_MS = 5 * 60 * 1000;

// GitHub Pages lets browsers cache index.html for 10 minutes, so an open or
// freshly navigated tab can keep running the previous build after a deploy.
// Compare against /version.json (fetched past all caches) and offer a reload.
export default function UpdateNotice() {
  const [newVersion, setNewVersion] = useState(null);

  useEffect(() => {
    if (!import.meta.env.PROD || APP_VERSION === "dev") return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (!stopped && version && version !== APP_VERSION) setNewVersion(version);
      } catch { /* offline or blocked: try again later */ }
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!newVersion) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] bg-gray-900 text-white text-sm rounded-lg shadow-lg pl-4 pr-2 py-2 flex items-center gap-3 max-w-[calc(100%-2rem)]">
      <span>Eine neue Version ist verfügbar.</span>
      <button
        className="px-3 py-1.5 rounded-md bg-white text-gray-900 font-medium hover:bg-gray-100 transition flex-shrink-0"
        onClick={() => {
          // Unique query bypasses the cached index.html; it restores the path itself
          sessionStorage.setItem("ghpages-redirect", location.pathname + location.search + location.hash);
          location.replace(`/?_r=${Date.now()}`);
        }}
      >
        Neu laden
      </button>
    </div>
  );
}
