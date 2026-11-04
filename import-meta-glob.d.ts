// Vite's `import.meta.glob`, as the tests use it to read source files as text
// (docs samples, the core environment guard, the Formisch hook guard).
interface ImportMeta {
  glob(
    pattern: string | readonly string[],
    options: { query: '?raw'; import: 'default'; eager: true },
  ): Record<string, string>;
}
