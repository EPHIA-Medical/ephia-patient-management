import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Short commit hash of the build, shown in the footer and published as
// /version.json so open tabs can notice a newer deploy
const APP_VERSION = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; }
})();

const versionFile = () => ({
  name: "version-file",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: APP_VERSION }) });
  },
});

// Patient opening page (/d/): only our own code may run there; it may only talk to
// the API and Supabase Storage (signed file URLs). Build only: the dev server needs
// inline scripts for hot reload.
const SHARE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src https://api.pms.ephia.de https://grfngjgjiipbgntsduom.supabase.co",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");
const shareCsp = () => ({
  name: "share-csp",
  apply: "build",
  transformIndexHtml(html, ctx) {
    if (!ctx.filename.replace(/\\/g, "/").endsWith("/d/index.html")) return html;
    return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${SHARE_CSP}" />`);
  },
});

// Main app: only our own scripts may run. The page holds the session and the
// encryption key. Scripts only (styles, images and fetches are not restricted);
// inline scripts, i.e. the 404 redirect replay, are allowed by hash. Build only,
// like the share CSP. Runs last, so the hashes match the served bytes.
const mainCsp = () => ({
  name: "main-csp",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(html, ctx) {
      if (ctx.filename.replace(/\\/g, "/").endsWith("/d/index.html")) return html;
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
      const csp = [`script-src 'self' ${hashes.join(" ")}`.trim(), "object-src 'none'", "base-uri 'self'"].join("; ");
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  },
});

export default defineConfig({
  plugins: [react(), versionFile(), shareCsp(), mainCsp()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  base: "/",
  // Second page: the patient's opening page for protected document links (/d/)
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        share: fileURLToPath(new URL("./d/index.html", import.meta.url)),
      },
    },
  },
  preview: {
    // Serve index.html for all routes in preview mode
    port: 4173,
  },
});
