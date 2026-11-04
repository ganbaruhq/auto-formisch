# A Form Definition is one Component tree, with no separate UI schema

A Form Definition holds data and presentation in a single tree of Components, and the Valibot schema for Formisch is compiled from it, because non-developers author stored forms and two parallel structures would add a whole class of mismatch errors: Fields with no place on screen, Layouts pointing at removed paths, and a Condition split between data (`required`) and UI (`visible`). The accepted cost is that one Definition has exactly one layout, so showing the same data in a different arrangement takes another Definition or hand-written Formisch `<Field>`s.

## Considered Options

- **A separate `uiSchema`, as in RJSF.** It wins only when one data shape needs several layouts, and slightly on Worker payload size. The current starter has a flat `ui` map, so this is a deliberate change.
- **Generating forms from a Valibot schema.** A schema cannot be stored as JSON because it contains functions, and it cannot express Layouts. Conditions written with `forward(partialCheck)` are opaque closures. Putting these in `v.metadata` would be a UI schema in disguise. A one-way adapter may follow after v1.

## Consequences

Per-screen changes to a Widget or label belong in the Renderer as render-time input, never in the Definition.
