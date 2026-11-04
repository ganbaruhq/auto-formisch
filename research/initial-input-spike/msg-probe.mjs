import * as v from 'valibot';
const MISSING = Symbol('missing');
const leaf = (msg, ...a) => v.optional(v.pipe(v.unknown(), v.check(x => x !== MISSING, msg), v.string(), ...a));
const mk = (msg) => v.object({ name: leaf(msg), code: leaf(undefined), email: v.optional(v.pipe(v.unknown(), v.string(), v.minLength(3))), custom: v.optional(v.pipe(v.unknown(), v.string(), v.minLength(3, 'From definition'))) });
const show = async (label, s, input, cfg) => {
  const r = await v.safeParseAsync(s, input, cfg);
  const std = await s['~standard'].validate(input);
  console.log(label, JSON.stringify((r.issues||[]).map(i => [i.path?.map(p=>p.key).join('.'), i.message])), 'STD', JSON.stringify((std.issues||[]).map(i => i.message)));
};
const input = { name: MISSING, code: 5, email: 'a', custom: 'a' };
await show('1 defaults', mk(), input);
await show('2 definition msg', mk('Bat buoc'), input);
v.setSpecificMessage(v.minLength, i => `Toi thieu ${i.requirement}`, 'vi');
v.setSpecificMessage(v.check, 'CHECK-VI', 'vi');
v.setSchemaMessage('SCHEMA-VI', 'vi');
await show('3 no lang', mk(), input);
await show('4 lang via parse config', mk(), input, { lang: 'vi' });
v.setGlobalConfig({ lang: 'vi' });
await show('5 lang via global config (same no-config call as Formisch)', mk(), input);
v.deleteGlobalConfig();
v.setGlobalMessage('GLOBAL-EN');
await show('6 global message', mk(), input);
v.deleteGlobalMessage();
// issue metadata for required
const r = v.safeParse(mk(), { name: MISSING });
console.log('7 issue', r.issues.map(i => ({ kind: i.kind, type: i.type, expected: i.expected, received: i.received })));
