import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const APP_VERSION = process.env.COMMIT_SHA || process.env.GITHUB_SHA || String(Date.now());
const versionJson = () => ({
  name: "emit-version-json",
  generateBundle(this: any) {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: APP_VERSION }) });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: { __APP_VERSION__: JSON.stringify(mode === "development" ? "dev" : APP_VERSION) },
  plugins: [react(), versionJson(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
