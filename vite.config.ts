import { defineConfig } from 'vite-plus';
export default defineConfig({
  test: { include: ['packages/**/*.test.{ts,tsx}'], environment: 'jsdom' },
  // Vendored from addyosmani/agent-skills; keep byte-identical to upstream.
  fmt: { singleQuote: true, ignorePatterns: ['.claude/skills/**', '.claude/references/**'] },
});
