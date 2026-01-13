// @ts-check
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import { copyCode } from "./rehype-plugin-copy-code";

// https://astro.build/config
export default defineConfig({
  trailingSlash: "never",
  build: {
    format: "file",
  },
  prefetch: {
    prefetchAll: true,
  },
  markdown: {
    rehypePlugins: [copyCode],
  },
  integrations: [svelte()],
  vite: {
    server: {
      proxy: {
        "/v2": {
          target: "https://ai.nahcrof.com",
          changeOrigin: true,
        },
        "/user_api": {
          target: "https://ai.nahcrof.com",
          changeOrigin: true,
        },
        "/user-api": {
          target: "https://ai.nahcrof.com",
          changeOrigin: true,
        },
        "/settings-api": {
          target: "https://ai.nahcrof.com",
          changeOrigin: true,
        },
      },
    },
  },
});
