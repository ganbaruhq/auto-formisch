# Changelog

## Unreleased

- First version, replacing `auto-formisch-react` with no compatibility layer.
- `<AutoForm form onSubmit id>` renders a compiled Form Definition on Formisch with native HTML, validates on submit and revalidates on input.
- Default Widgets for `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`, and a default Field Wrapper.
- Default Widgets for `object` (a `fieldset`) and `repeater` (a `fieldset` of rows that can be added, removed and moved, with values and errors staying on their row).
- Conditions through `prep`'s evaluator: a hidden Component is not rendered (it takes no grid cell, and a hidden Tab leaves the list) and its values come back when it reappears; a disabled Field, `object` or Repeater is disabled natively, with adding, removing and moving rows turned off; `required` follows its Condition.
- Re-exports all of `@auto-formisch/core`.
