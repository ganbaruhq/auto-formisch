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
