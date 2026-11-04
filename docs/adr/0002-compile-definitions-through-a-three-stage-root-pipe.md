# A Form Definition compiles to a three-stage root pipe with loosely typed leaves

A Form Definition compiles to one schema, `v.pipe(skeleton, v.transform(prep), typedObject)`, because it must work both as the static schema Formisch walks to build its store and as a self-sufficient Standard Schema that gives a server the same result as the form. `skeleton` has loosely typed leaves so that Formisch builds the right store shape and a hidden Field holding a wrongly typed value cannot block submission. `prep` evaluates Conditions and normalizes empty, hidden and disabled values. `typedObject` runs types and Rules as native Valibot actions, which keeps issue paths, messages and `abortEarly` in Valibot's hands. The accepted costs are `unknown` leaves on the input and field-store types, per-Field introspection only at `schema.pipe.at(-1)`, an internal symbol for a missing required value, and a custom `prep` walker and Condition evaluator.

## Considered Options

- **Strictly typed leaves with `v.forward(v.partialCheck(...))`.** A hidden Field with a wrongly typed value fails the whole form, and a row-level check cannot read Fields outside its row. A root-level check with `$` cannot route its error to a specific row.
- **Unions with an empty-value branch.** These throw in Formisch on multi-value Fields (`Store initialized as "value" cannot be reinitialized as "array"`).
- **A root `rawTransform` that interprets the whole Definition.** It works, but it must build issue paths by hand, and Formisch silently swallows issues with a bad path: the result fails with no error shown and `form.isValid` stays `true`. It remains the fallback if the symbol proves unacceptable.
- **A root `v.lazy` that rebuilds the schema per validation.** It works, but is not static, has no introspection, and was the slowest in a rough benchmark.

## Consequences

Consumers must read errors only as `{message, path}`, never as raw Valibot issues, because a required issue carries the internal symbol. The Renderer must share `prep`'s Condition evaluator so that what is shown cannot drift from what is validated.
