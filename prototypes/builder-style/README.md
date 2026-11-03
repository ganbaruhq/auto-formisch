# AF-5 prototype: Fluent Builder style (THROWAWAY, never merge)

Same sample form (Section, Grid, Repeater, Select, conditional field, Toggle) written two ways:

- `a-classes.ts` + `a-sample.ts`: Filament-faithful classes, `TextInput.make('email').email().required()`
- `b-functions.ts` + `b-sample.ts`: Valibot-like functions + pipe, `text('email', [email(), required()])`

Both emit an identical (provisional, pre-AF-6) Definition and both infer the exact `onSubmit`
type in `shared.ts#ExpectedOutput`, checked by `assertType<Equal<...>>`.

Run: `tsc -p .` (global TypeScript 5.9).
