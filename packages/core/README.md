# @auto-formisch/core

Framework-neutral loader and compiler for Auto Formisch Form Definitions. It runs on a server or in a Worker with only Valibot: no React, DOM, Node APIs or Formisch.

```ts
import { compile } from '@auto-formisch/core';

const form = compile(storedDefinition); // throws DefinitionError with every {message, path}
const result = form['~standard'].validate(requestBody);
// { value } or { issues: [{ message, path }] }
```

A JSON Schema for format version 1 ships at `schema/v1.json`; reference it from a Definition for editor autocomplete:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@auto-formisch/core/schema/v1.json",
  "version": 1,
  "components": []
}
```

See the [repository README](../../README.md).
