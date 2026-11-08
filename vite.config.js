import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
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

export default defineConfig({
  plugins: [react(), versionFile()],
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
