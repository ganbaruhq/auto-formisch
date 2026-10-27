import { afterEach, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as v from 'valibot';
import { AutoForm } from './index';
afterEach(cleanup);
it('validates and submits typed values through Formisch', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <AutoForm
      schema={v.object({
        email: v.pipe(v.string(), v.email('Invalid email')),
        age: v.number(),
        consent: v.boolean(),
      })}
      onSubmit={onSubmit}
    />,
  );
  await user.type(screen.getByLabelText('email'), 'bad');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('email'));
  await user.type(screen.getByLabelText('email'), 'a@example.com');
  await user.type(screen.getByLabelText('age'), '25');
  await user.click(screen.getByLabelText('consent'));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][0]).toEqual({ email: 'a@example.com', age: 25, consent: true });
});

it('submits an untouched checkbox as false and an optional number as absent', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <AutoForm
      schema={v.object({ consent: v.boolean(), age: v.optional(v.number()) })}
      onSubmit={onSubmit}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][0]).toMatchObject({ consent: false });
  expect(onSubmit.mock.calls[0][0].age).toBeUndefined();
});
