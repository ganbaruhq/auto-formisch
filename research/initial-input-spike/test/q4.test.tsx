import { it } from 'vitest';
import * as v from 'valibot';
import { compileC, compileE, type Node } from '../src/compile';
import { log, plain } from '../src/harness';

const DEF: Node[] = [{ kind: 'repeater', key: 'groups', template: [{ kind: 'repeater', key: 'members', template: [{ kind: 'field', key: 'name', type: 'string', rules: [{ type: 'minLength', n: 2, message: 'min2' }] }] }] }];
const inp = { groups: [{ members: [{ name: 'okay' }, { name: 'a' }] }] };
const native = v.object({ groups: v.array(v.object({ members: v.array(v.object({ name: v.pipe(v.string(), v.minLength(2, 'min2')) })) })) });
const trim = (r: any) => r.issues?.map((i: any) => ({ ...i, path: i.path?.map((p: any) => ({ ...p, input: Array.isArray(p.input) ? '[array]' : '{obj}', value: typeof p.value === 'object' ? '[obj]' : p.value })) }));

it('paths', () => {
  for (const [name, s] of Object.entries({ native, C: compileC(DEF), E: compileE(DEF) })) {
    const r = (s as any)['~standard'].validate(inp);
    log(`\n=== ${name} sync?`, !(r instanceof Promise));
    log('issue.path raw', trim(r)[0].path);
    log('all issue keys', Object.keys(r.issues[0]));
    log('plain', plain(r.issues));
    log('getDotPath', v.getDotPath(r.issues[0]));
    log('flatten', v.flatten(r.issues as any));
    log('Array.isArray(path)/first item type', [Array.isArray(r.issues[0].path), typeof r.issues[0].path[0]]);
  }
  const root = (compileC(DEF) as any)['~standard'].validate(null);
  log('\nroot-level issue path', root.issues.map((i: any) => [i.message, i.path]));
  log('~standard version/vendor', [(native as any)['~standard'].version, (native as any)['~standard'].vendor]);
});
