import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  define: {
    __APP_ENV__: JSON.stringify(process.env.APP_ENV ?? "local"),
  },
});
