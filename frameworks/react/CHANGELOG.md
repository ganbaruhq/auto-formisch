# Changelog

## Unreleased

- First version, replacing `auto-formisch-react` with no compatibility layer.
- `<AutoForm form onSubmit id>` renders a compiled Form Definition on Formisch with native HTML, validates on submit and revalidates on input.
- Default Widgets for `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`, and a default Field Wrapper.
- Default Widgets for `object` (a `fieldset`) and `repeater` (a `fieldset` of rows that can be added, removed and moved, with values and errors staying on their row).
- Conditions through `prep`'s evaluator: a hidden Component is not rendered (it takes no grid cell, and a hidden Tab leaves the list) and its values come back when it reappears; a disabled Field, `object` or Repeater is disabled natively, with adding, removing and moving rows turned off; `required` follows its Condition.
- Re-exports all of `@auto-formisch/core`.
- `widgets`, `layouts` and `fieldWrapper` replace the defaults independently. Widget map entries are a component or `{ component, group?, appliesTo? }`, looked up by `widget ?? type`; an entry named after a built-in type is type-checked against that type's props.
- More default Widgets: `textarea`, `email`, `url`, `password`, `toggle`, `radio` and `multi_select`. Every default Widget declares `appliesTo`.
- `overrides` changes a Field's `widget`, `label`, `description` or `placeholder` by data path, never its validation.
- On mount, the whole tree is checked, and an `AutoFormError` lists every unknown Widget name, wrong `appliesTo` and unknown override path or key as `{message, path}`.
- `labels` sets the wording of the default buttons; `actions` replaces the action area.
- `useAutoForm(form)` returns the Formisch store, which `<AutoForm store>` accepts; `useFormValue(path)` reads another Field from a Widget, through the resolver Conditions use, and reads an Inactive Field as empty.
- Exports the Widget, Layout and Field Wrapper contracts (`WidgetProps`, `RepeaterProps`, `ObjectProps`, `ContentProps`, `LayoutProps`, `TabsLayoutProps`, `FieldWrapperProps`, `WidgetMap` and others).
- `onSubmit` is typed by the output of a form built with the Fluent Builder.
- Defaults seed a new form, Repeater `default` rows included, and a Repeater's Add builds its row from the defaults of its Fields.
- `initialInput`, on `<AutoForm>` and `useAutoForm(form, { initialInput })`, starts the form from an existing record, read only at mount. It replaces every default, and is normalized first; a dropped value gets a `console.warn`. Combining it with `store` throws.
- A `form` that changes without a remount throws an `AutoFormError`, from `<AutoForm>` and `useAutoForm`.
- The `hidden` Widget keeps a value of any value Field with no UI and no Field Wrapper; its errors show in the general error region.
- Locked Fields (from `lock`) render read-only: Widgets and the Field Wrapper get `readOnly: true`, the default text, number and date Widgets use native `readonly`, and select, radio, checkbox and multi-choice use native `disabled`. The Renderer passes a Locked Field's Widget the Locked value and ignores its `onChange`, and Conditions read the Locked value, not the store.
- Wizards: only the open Page is mounted, inside a focusable `role="group"` named by its label, which takes focus on a Page change. Going forward validates the whole form and stops at the first Page on the way with errors; going back never validates. Only attempted Pages show errors. A failed submit opens the first Page with an error and focuses it, and a native submit before the last Page runs "Next". A Wizard store validates on input. `actions` and the new `page` Layout get `wizard { pages, isFirst, isLast, next, back, goTo }`; `labels` gains `next` and `back`. New contract types `Wizard`, `WizardPage` and `PageLayoutProps`.
- A custom Field Type renders with the Widget supplied under its name in `widgets`; `WidgetProps` and `FieldWrapperProps` take its node (`InferFieldNode<typeof type>`).
- Custom code that throws while validating is handled one way everywhere: a submit, revalidation on input and every Wizard move rethrow it during render for an error boundary, never as a validation message and with no rejected Promise; `wizard.next()` and `goTo()` resolve `false`.
- A failed submit moves focus once, to the first Field with an error in Definition order, even when it sits in a closed Tab or on an earlier Wizard Page: Formisch's own submit no longer focuses a later Field first. Formisch's `focus(store, ...)` no longer finds the Fields' elements.
- An error returned by `onSubmit` for a disabled Field, which is Inactive, shows in the general error region, like one for a hidden Field.
- An error of a `hidden`-Widget Field shows in the general error region named by the Field (`id: Required`), and a required `hidden`-Widget Field with no `default` that the user could never fill logs a `console.warn` on mount.
- The default number Widget no longer reads text the browser can't parse ("1e", "-", ".") as empty: it emits `NaN`, the Field shows `labels.invalidNumber` (`Enter a number`), the form doesn't submit, and the text stays in the box. New label `invalidNumber`.
- A keystroke in a form with Conditions re-renders only the Field typed into and the Components whose Condition result changed, not every mounted Field: each Component subscribes to its own result.
