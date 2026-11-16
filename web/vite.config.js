import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __BUILD_SHA__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7)), // Vercel sets this on every build
        __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    server: { proxy: { "/api": "http://127.0.0.1:5050", "/health": "http://127.0.0.1:5050" } },
});
