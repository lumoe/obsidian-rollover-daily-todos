import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    exclude: [
      "node_modules/**",
      "test/**",
      ".claude/**",
      ".obsidian-cache/**",
    ],
  },
});
