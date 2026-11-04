# Changelog

## Unreleased

- First version, replacing `auto-formisch-core`, `auto-formisch-json` and `auto-formisch-builder` with no compatibility layer.
- `compile` loads a version 1 Form Definition and compiles it into a three-stage root pipe usable through `~standard.validate`.
- The `text` Field Type with `required`, `requiredMessage` and the `email`, `min_length` and `max_length` Rules.
- Load errors are thrown together as a `DefinitionError` of `{message, path}`.
