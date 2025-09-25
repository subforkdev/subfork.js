import { defineConfig } from "vite";

const libConfig = defineConfig({
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

const badgeConfig = defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/badge.js",
      name: "SubforkBadge",
      formats: ["iife"],
      fileName: () => "badge.min.js",
    },
    sourcemap: false,
  },
});

export default defineConfig(({ command, mode }) => {
  // dev server should use the lib config
  if (command === "serve") return libConfig;

  // builds: pick by mode
  if (mode === "badge") return badgeConfig;
  return libConfig; // default build: lib
});
