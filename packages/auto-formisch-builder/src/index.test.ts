import { expect, it } from 'vite-plus/test';
import * as v from 'valibot';
import { buildForm } from './index';
it('compiles editable definitions into validation and UI', () => {
  const { schema, ui } = buildForm({
    version: 1,
    fields: {
      name: {
        type: 'string',
        rules: [{ type: 'min_length', requirement: 2, message: 'Too short' }],
      },
    },
    ui: { name: { label: 'Your name' } },
  });
  expect(v.parse(schema, { name: 'Ada' })).toEqual({ name: 'Ada' });
  expect(v.safeParse(schema, { name: 'A' }).success).toBe(false);
  expect(ui.name.label).toBe('Your name');
});
it('rejects UI widgets incompatible with their data type', () => {
  expect(() =>
    buildForm({
      version: 1,
      fields: { age: { type: 'number', rules: [] } },
      ui: { age: { widget: 'textarea' } },
    }),
  ).toThrow('Incompatible widget');
});
