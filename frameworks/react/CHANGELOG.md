# Changelog

## Unreleased

- First version, replacing `auto-formisch-react` with no compatibility layer.
- `<AutoForm form onSubmit id>` renders a compiled Form Definition on Formisch with native HTML, validates on submit and revalidates on input.
- Default Widgets for `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`, and a default Field Wrapper.
- Default Widgets for `object` (a `fieldset`) and `repeater` (a `fieldset` of rows that can be added, removed and moved, with values and errors staying on their row).
- Re-exports all of `@auto-formisch/core`.
