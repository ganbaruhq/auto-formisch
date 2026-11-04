# Changelog

## Unreleased

- First version, replacing `auto-formisch-core`, `auto-formisch-json` and `auto-formisch-builder` with no compatibility layer.
- `compile` loads a version 1 Form Definition and compiles it into a three-stage root pipe usable through `~standard.validate`.
- The `text` Field Type with `required`, `requiredMessage` and the `email`, `min_length` and `max_length` Rules.
- The `number`, `boolean`, `choice`, `multi_choice` and `date` Field Types, and the `url`, `min_value`, `max_value`, `integer`, `accepted`, `min_items` and `max_items` Rules.
- The `object` and `repeater` Fields, each its own data scope, with no `required`; they always output `{}` and `[]` at least. `min_items` and `max_items` apply to a `repeater`. `FieldNode` now includes them; the single-value Fields are `ValueField`.
- Load errors are thrown together as a `DefinitionError` of `{message, path}`.
