import { build, type Rolldown } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';

const core = decodeURIComponent(new URL('./index.ts', import.meta.url).pathname);

/** Bundles a consumer module, unminified, the way an application build would. */
async function bundle(source: string): Promise<string> {
  const id = '\0consumer';
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'consumer',
        enforce: 'pre',
        resolveId: (request) => (request.endsWith('consumer') ? id : null),
        load: (request) => (request === id ? source : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry: 'consumer', formats: ['es'] },
      rollupOptions: { external: ['valibot'] },
    },
  });
  const [output] = result as Rolldown.RolldownOutput[];
  return output.output[0].code;
}

const declares = (code: string, name: string) =>
  new RegExp(`\\b(function|var|let|const) ${name}\\b`).test(code);

const unused = ['multiChoice', 'repeater', 'tabs', 'minItems', 'accepted', 'isIn', 'compile'];

describe('tree-shaking', () => {
  it('leaves unused Builder Field Types and Rules out of a consumer bundle', async () => {
    const code = await bundle(
      `import { text, email, label } from ${JSON.stringify(core)};\n` +
        `export const field = text('a', [email(), label('A')]);`,
    );
    for (const used of ['text', 'email', 'label']) expect(declares(code, used)).toBe(true);
    for (const name of unused) expect(declares(code, name)).toBe(false);
    // Without `form`, not even the loader's tables of built-in types are bundled.
    expect(code).not.toContain('multi_choice');
  });

  it('keeps the unused Builder functions out when form() brings in the loader', async () => {
    // The loader checks any JSON, so it always holds every built-in type and
    // Rule; only the Builder's own functions are left out.
    const code = await bundle(
      `import { form, text, email } from ${JSON.stringify(core)};\n` +
        `export const definition = form([text('a', [email()])]);`,
    );
    const built = [...code.matchAll(/\bapply\(\{\s*type: "(\w+)"/g)].map((match) => match[1]);
    const rules = [...code.matchAll(/\brule\("(\w+)"/g)].map((match) => match[1]);
    expect(built).toEqual(['text']);
    expect(rules).toEqual(['email']);
    expect(declares(code, 'isIn')).toBe(false);
  });
});
