import { defineConfig } from 'vite-plus';
export default defineConfig({
  test: { include: ['packages/**/*.test.{ts,tsx}'], environment: 'jsdom' },
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      // Vendored from addyosmani/agent-skills; keep byte-identical to upstream.
      '.claude/skills/**',
      '.claude/references/**',
      // Written by `changeset add` with double quotes and deleted on release.
      '.changeset/*.md',
    ],
  },
});
