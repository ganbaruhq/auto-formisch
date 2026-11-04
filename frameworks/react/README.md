# @auto-formisch/react

React Renderer for Auto Formisch Form Definitions, built on Formisch. It re-exports all of `@auto-formisch/core`, so a React application installs only this package and its peers.

```sh
pnpm add @auto-formisch/react @formisch/react valibot react react-dom
```

<!-- example: docs/examples/contact-builder.tsx#builder -->

```tsx
import {
  AutoForm,
  choice,
  compile,
  email,
  form,
  label,
  maxLength,
  required,
  text,
  widget,
  type InferOutput,
} from '@auto-formisch/react';

export const contact = form([
  text('name', [label('Name'), required()]),
  text('email', [label('Email address'), required(), email('Enter a valid email address')]),
  choice(
    'topic',
    [
      { value: 'sales', label: 'Sales' },
      { value: 'support', label: 'Support' },
    ],
    [label('Topic')],
  ),
  text('message', [label('Message'), widget('textarea'), maxLength(2000)]),
]);

export type Contact = InferOutput<typeof contact>;
// { name: string; email: string; topic?: 'sales' | 'support'; message?: string }

const contactForm = compile(contact);

export function ContactForm({ onSend }: { onSend: (contact: Contact) => void }) {
  return <AutoForm form={contactForm} onSubmit={(output) => onSend(output)} />;
}
```

- [Guide](../../docs/guide.md), and [Before you ship](../../docs/guide.md#before-you-ship)
- [Reference](../../docs/reference.md)
- [Version policy](../../README.md#versions) and [changelog](CHANGELOG.md)
