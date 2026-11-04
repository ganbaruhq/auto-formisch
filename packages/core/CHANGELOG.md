# Changelog

## Unreleased

- First version, replacing `auto-formisch-core`, `auto-formisch-json` and `auto-formisch-builder` with no compatibility layer.
- `compile` loads a version 1 Form Definition and compiles it into a three-stage root pipe usable through `~standard.validate`.
- The `text` Field Type with `required`, `requiredMessage` and the `email`, `min_length` and `max_length` Rules.
- The `number`, `boolean`, `choice`, `multi_choice` and `date` Field Types, and the `url`, `min_value`, `max_value`, `integer`, `accepted`, `min_items` and `max_items` Rules.
- Load errors are thrown together as a `DefinitionError` of `{message, path}`.
- `setRequiredMessage(message, lang?)` and `deleteRequiredMessage(lang?)`: a required error resolves through `requiredMessage`, then `setRequiredMessage`, then `Required`, and never shows the internal value. Other messages go through Valibot, with the Definition's `message` first.
