# @auto-formisch/react

React Renderer for Auto Formisch Form Definitions, built on Formisch. It re-exports all of `@auto-formisch/core`, so a React application installs only this package plus its peers.

```tsx
import { AutoForm, compile } from '@auto-formisch/react';

const form = compile(storedDefinition);

<AutoForm form={form} onSubmit={(output) => save(output)} />;
```

See the [repository README](../../README.md).
