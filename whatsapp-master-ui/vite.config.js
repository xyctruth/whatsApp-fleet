import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 允许局域网访问
    port: 3001,
    proxy: {
      "/api/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/api/worker": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/worker/, "/api"),
        secure: false,
      },
    },
  },
});
