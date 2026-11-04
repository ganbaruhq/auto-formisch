import { it } from 'vitest';
import * as v from 'valibot';
import { toJsonSchema } from '@valibot/to-json-schema';
import { compileC, compileD, compileE, type Node } from '../src/compile';
import { log } from '../src/harness';

const DEF: Node[] = [
  { kind: 'field', key: 'nick', type: 'string', required: true, rules: [{ type: 'minLength', n: 3, message: 'min3' }] },
  { kind: 'repeater', key: 'rows', template: [
    { kind: 'field', key: 'a', type: 'string', required: { op: 'eq', scope: 'root', path: ['nick'], value: 'x' }, rules: [{ type: 'minLength', n: 2, message: 'm' }] },
    { kind: 'field', key: 'b', type: 'number', visible: { op: 'eq', scope: 'row', path: ['a'], value: 'yy' } },
  ] },
];
it('introspection', () => {
  const C = compileC(DEF), E = compileE(DEF), D = compileD(DEF);
  log('\n=== introspection');
  log('C root', [C.type, C.pipe.map((p: any) => p.type), C.entries.nick.type, C.entries.nick.wrapped.type]);
  log('E root', [E.type, E.pipe.map((p: any) => p.type), E.entries.nick.wrapped.type, 'last.nick.pipe', E.pipe.at(-1).entries.nick.wrapped.pipe.map((p: any) => p.type)]);
  log('D root', [D.type, 'entries' in D]);
  const tj = (label: string, s: any, cfg?: any) => { try { log(label, toJsonSchema(s, cfg)); } catch (e: any) { log(label + ' THROWS', e.message); } };
  tj('toJsonSchema C', C);
  tj('toJsonSchema C ignore', C, { errorMode: 'ignore' });
  tj('toJsonSchema E ignore', E, { errorMode: 'ignore' });
  tj('toJsonSchema E last stage ignore', E.pipe.at(-1), { errorMode: 'ignore' });
  log('getDefaults C/E', [v.getDefaults(C), v.getDefaults(E)]);
});
it('bench', () => {
  const big = { nick: 'abc', rows: Array.from({ length: 1000 }, (_, i) => ({ a: i % 2 ? 'yy' : '', b: i })) };
  log('\n=== bench 1000 rows, 200 iterations, ms total (one machine, indicative only)');
  for (const [n, c] of Object.entries({ C: compileC, D: compileD, E: compileE })) {
    const s = c(DEF);
    const t = performance.now();
    for (let i = 0; i < 200; i++) s['~standard'].validate(big);
    log(n, Math.round(performance.now() - t));
  }
});
