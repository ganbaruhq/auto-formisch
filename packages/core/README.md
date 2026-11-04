# @auto-formisch/core

Framework-neutral loader, compiler and validator for Auto Formisch Form Definitions. It runs on a server or in a Worker with only Valibot: no React, DOM, Node APIs or Formisch.

```sh
pnpm add @auto-formisch/core valibot
```

<!-- example: docs/examples/contact-server.ts#server -->

```ts
import { compile } from '@auto-formisch/core';
import definition from './contact.json';
import { saveContact } from './app';

const form = compile(definition);

export async function handleContact(request: Request): Promise<Response> {
  const result = form['~standard'].validate(await request.json());
  if (result.issues) return Response.json({ errors: result.issues }, { status: 422 });
  await saveContact(result.value);
  return new Response(null, { status: 204 });
}
```

It also holds the Fluent Builder, `lock`, `defineFieldType` and `defineRule`, and ships a JSON Schema for format version 1 at `schema/v1.json`, for a Definition's `$schema`.

- [Guide](../../docs/guide.md), and [Before you ship](../../docs/guide.md#before-you-ship)
- [Reference](../../docs/reference.md)
- [Version policy](../../README.md#versions) and [changelog](CHANGELOG.md)
