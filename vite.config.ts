import { defineConfig } from 'vite-plus';
export default defineConfig({
  test: {
    projects: [
      // core must run on a server or Worker, so its tests run with no DOM.
      { test: { name: 'core', include: ['packages/core/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'react',
          include: ['frameworks/react/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      // The code samples of the docs, run against the built packages.
      { test: { name: 'docs', include: ['docs/**/*.test.{ts,tsx}'], environment: 'jsdom' } },
    ],
  },
  // Vendored from addyosmani/agent-skills; keep byte-identical to upstream.
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      '.claude/skills/**',
      '.claude/references/**',
      '.claude/worktrees/**',
      '.claude/settings.local.json',
    ],
  },
});
