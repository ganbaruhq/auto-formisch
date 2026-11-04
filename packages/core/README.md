# @auto-formisch/core

Framework-neutral loader and compiler for Auto Formisch Form Definitions. It runs on a server or in a Worker with only Valibot: no React, DOM, Node APIs or Formisch.

```ts
import { compile } from '@auto-formisch/core';

const form = compile(storedDefinition); // throws DefinitionError with every {message, path}
const result = form['~standard'].validate(requestBody);
// { value } or { issues: [{ message, path }] }
```

See the [repository README](../../README.md).
