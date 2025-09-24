import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/subfork.js",
      name: "Subfork",
      formats: ["es", "iife"],
      fileName: (fmt) => (fmt === "es" ? "subfork.mjs" : "subfork.min.js"),
    },
    sourcemap: true,
  },
  server: {
    open: "/examples/index.html",
    proxy: {
      "/socket.io": {
        target: "https://events.subfork.dev",
        changeOrigin: true,
        ws: true,
        secure: true,
      },
    },
  },
});
