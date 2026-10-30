# What Formisch supports (AF-4)

Research for the Auto Formisch v1 spec: what `@formisch/react` can and cannot do for auto-rendering a Form Definition (Fields, Layouts incl. Wizard steps, Repeaters, nested objects, Conditions for visible/required/disabled).

- Version researched: `@formisch/react@1.1.1` with `valibot@1.5.0` (pinned in `pnpm-lock.yaml`; peer range `valibot >=1.4.1 <2`).
- Primary sources:
  - Installed source: `node_modules/.pnpm/@formisch+react@1.1.1_*/node_modules/@formisch/react/dist/{index.js,index.d.ts,internals.js,internals.d.ts}`. The `internals.*` files bundle `@formisch/core` (upstream: `packages/core/src/...` in https://github.com/open-circle/formisch). Line numbers below refer to these dist files.
  - Official docs: https://formisch.dev/react/guides/ (full React docs as one file: https://formisch.dev/llms-react-full.txt).
  - Behavior spot-checks: a Node script against the installed `internals.js` + `valibot` (results quoted in section 3).

## TL;DR

Formisch is schema-first and static. `useForm` builds the whole field store tree once from the Valibot schema and never rebuilds it. Every validation run parses the whole form, and the issues are mapped to fields by path. Nested objects, arrays (insert/remove/move/swap/replace with stable row IDs), `optional`/`nullable`, `union`/`variant`/`intersect` and `lazy` are supported. `record`, `object_with_rest`, `tuple_with_rest` and `promise` throw. Formisch has no runtime schema swap, no per-step (partial) validation, no unregister, and no `disabled` concept. Conditions therefore have to be compiled into one static schema (`v.variant` or `v.forward(v.partialCheck(...))`), and the Renderer evaluates them for visibility and disabled state.

## 1. Capabilities and limits

### 1.1 Schema shapes / nested paths

| Feature | Status | Evidence |
| --- | --- | --- |
| Root must be an object-output schema (sync or async) | Required | `type FormSchema = v.GenericSchema<Record<string, unknown>> \| v.GenericSchemaAsync<...>` (`internals.d.ts:189`) |
| Nested objects (`object`, `loose_object`, `strict_object`) | Supported | `initializeFieldStore` creates an object store with `children` keyed by entry (`internals.js:112-178`). Docs: "A `v.object(...)` becomes an `InternalObjectStore`" (formisch.dev Internals guide) |
| Nested paths | Supported as key arrays, e.g. `path={['user','address','city']}` or `['items', 0, 'label']` | `getFieldStore` walks `children[key]` (`internals.js:518-530`). Nested fields guide: https://formisch.dev/react/guides/nested-fields/ |
| `array`, `tuple`, `loose_tuple`, `strict_tuple` | Supported (array store) | `internals.js:128-148` |
| `optional`, `nullable`, `nullish`, `exact_optional`, `undefinedable` | Unwrapped. `v.getDefault` supplies a missing initial value | `internals.js:115` |
| `non_nullable`, `non_nullish`, `non_optional`, `lazy` | Unwrapped | `internals.js:114-116` |
| `union`, `variant`, `intersect` | Every option is initialized into the **same** store, so the store holds the union of all keys | `internals.js:117`. Docs: "`v.union`, `v.variant` and `v.intersect` initialize every option into the same store, which is what lets you address discriminated fields with a single field path." (Internals guide) |
| Same key with conflicting kinds across options (object in one option, string in another) | **Throws** `Store initialized as "value" cannot be reinitialized as "object"` | `internals.js:131,154,168` |
| `record`, `object_with_rest`, `tuple_with_rest`, `promise` | **Throws** `"<type>" schema is not supported` (verified for `record`) | `internals.js:113` |
| Leaf types with special handling | `string`, `number`, `boolean`, `date`, `file`, `picklist`, etc. are value stores. A required (non-optional) string defaults to `''`, and other types default to `undefined` (configurable via `emptyInput`) | `DEFAULT_EMPTY_INPUT = { string: "" }` (`internals.js:649`), `EmptyInput` (`internals.d.ts:422-444`) |
| Path to a missing field | `getFieldStore` throws `No field store found at path ...`. A non-existent array index returns `undefined` | `internals.js:518-530` |

### 1.2 Field arrays (Repeater)

| Feature | Status | Evidence |
| --- | --- | --- |
| `FieldArray` component / `useFieldArray(form, { path })` | Exposes `items: string[]`, `errors`, `isTouched/isEdited/isDirty/isValid` | `index.d.ts:1001-1030`, `index.js:504-530` |
| `insert(form, { path, at?, initialInput? })` | Supported. Appends when `at` is omitted | `index.d.ts:422-443`, `index.js:130-166` |
| `remove(form, { path, at })` | Supported | `index.js:266-290` |
| `move(form, { path, from, to })` | Supported | `index.js:193-229` |
| `swap(form, { path, at, and })` | Supported | `index.js:378-404` |
| `replace(form, { path, at, initialInput? })` | Supported (gets a new row ID) | `index.js:291-309` |
| Stable keys per row | `items` are unique IDs from `createId()` that move with the row on insert/move/swap/remove. Docs say to use them as the React `key` | `index.js:155-157,202,388-391`. Field arrays guide: https://formisch.dev/react/guides/field-arrays/ |
| Row **paths** are index-based | Field state is copied between index slots (`copyItemState`/`swapItemState`), so a row's path (`['items', 2, 'x']`) changes when it moves. Docs: "use the index from `map()` ... so the paths update correctly when items are added, moved, or removed" | `internals.js:193-330`, field arrays guide |
| Nested field arrays | Supported to any depth | Field arrays guide: "You can nest field arrays as deeply as you like." |
| Min/max rows | Expressed in the schema (`v.minLength`/`v.maxLength` on `v.array`). Errors land on `fieldArray.errors` | Field arrays guide |

### 1.3 Value-dependent schema (conditional required/visible)

| Question | Answer | Evidence |
| --- | --- | --- |
| Can the schema change at runtime? | **No.** `useForm` creates the store in `useMemo(..., [])` and closes over `config.schema`, so a new `schema` prop is ignored. To replace the schema, remount with a new React `key` (the README already says this) | `index.js:534-537`. Internals guide quotes the same `useMemo` |
| Unregister/hide fields? | **No equivalent.** Docs: "In Formisch, the schema defines which fields exist, independent of what is currently mounted. For conditional form shapes, model the variants in the schema, for example with `v.optional` or `v.variant`." | Migrate-from-RHF guide (https://formisch.dev/react/guides/migrate-from-react-hook-form/) |
| Hidden (unmounted) fields | They stay in the store, keep their input, and are sent to `parse`. Unmounting a `Field` only detaches DOM elements | `useField` cleanup (`index.js:446-454`), `getFieldInput` builds input from all children (`internals.js:454-472`) |
| Conditional required via `v.variant` | Works. All branch keys exist in the store, the inactive branch's keys are parsed by the active `v.object` (non-strict, so they are stripped from the output), and the active branch's rules produce field errors | Spot-check C/D/E below |
| Conditional required via `v.pipe(v.object(...), v.forward(v.partialCheck(paths, fn, msg), targetPath))` | Works. The issue carries `targetPath` and Formisch maps it to that field's `errors` | Spot-check A/B. Issue to field mapping by `issue.path` keys (`internals.js:893-915`). Formik migration guide: "Cross-field rules ... become schema-level checks with `v.forward` and `v.partialCheck`." |
| Root-level `v.check` without `forward` | The error goes to `form.errors` (root), not to a field | Issues without `path` become `rootErrors` (`internals.js:909-912`). `FormStore.errors` doc (`index.d.ts:1066-1071`) |
| `disabled` | Formisch has no disabled concept. `getElementInput` skips `disabled` checkbox/select options when reading DOM input, and nothing else uses it | `internals.js:486-515` |
| `strict_object` + `variant` | Risky. Every branch key is always present in the input (`kind`, `name`, `vat: ''` in spot-check C), so a `strict_object` branch would reject the other branches' keys | Spot-check C, `internals.js:117` |

### 1.4 Validation modes and partial validation

| Feature | Status | Evidence |
| --- | --- | --- |
| Modes | `validate`: `'initial' \| 'touch' \| 'input' \| 'change' \| 'blur' \| 'submit'` (default `'submit'`). `revalidate`: the same minus `'initial'` (default `'input'`) | `internals.d.ts:413,445-467`, `createFormStore` (`internals.js:669-670`). Validation guide: https://formisch.dev/react/guides/validation/ |
| Trigger rule | Before the first submit (mode `submit`) or before a field has errors, the `validate` mode applies. After that, `revalidate` applies | `validateIfRequired` (`internals.js:946-948`) |
| Scope of every validation | **Whole form.** Docs: "Validation always runs against the whole schema, even when a single field triggers it." Every run overwrites the `errors` of **every** field store, including hidden ones | `validateFormInput` (`internals.js:888-944`), validation guide |
| `validate(form, { shouldFocus? })` | Whole-form only. There is no `path` option. Docs (RHF migration): "`validate` always validates the entire form" | `index.d.ts:908-924`, `index.js:409-411` |
| Per-step (Wizard) validation | **Not built in.** Upstream has an open design discussion for a multi-step API (https://github.com/open-circle/formisch/discussions/108). Its current workaround is one form per step, and the maintainer's sketch is `useMultiStepForm({ schemas: { step1, step2 } })`. The docs link that discussion for wizards | `llms-react-full.txt` line 418 |
| Custom errors | `setErrors(form, { path?, errors })` sets field or root errors, but the next validation run overwrites them | `index.js:348-351`, `internals.js:917-925` |
| Async | Parsing always uses `v.safeParseAsync`, so async schemas are supported. `isValidating` tracks it, and stale results are discarded via `validationId` | `index.js:536`, `internals.js:889-897` |
| `isValid` | Reflects the **last validation run**. With `validate: 'submit'` it stays `true` until the first submit | RHF migration guide notes |
| Submit | `<Form of onSubmit>` sets `noValidate`, validates the whole form, focuses the first invalid field (schema order), and calls `onSubmit(output, event)` only on success. A thrown handler error becomes a root error | `index.js:97-127,605-614` |

### 1.5 Initial values, reset, reactive reads

| Feature | Status | Evidence |
| --- | --- | --- |
| `initialInput` (DeepPartial) | Supported in `useForm`. Array lengths come from `initialInput` | `internals.d.ts:453`, `internals.js:132-136` |
| Schema defaults (`v.optional(x, default)`) | Used when `initialInput` is `undefined` | `internals.js:115` |
| `reset(form, { path?, initialInput?, keepInput?, keepTouched?, keepEdited?, keepErrors?, keepSubmitted? })` | Form or subtree reset. It can also replace the initial input (useful for load-then-edit) | `index.d.ts:716-782`, `index.js:310-347` |
| `setInput(form, { path?, input })` | Programmatic write. It marks the field touched and edited and runs validation per mode | `index.js:352-367` |
| Reactive reads | `getInput(form, { path })`, `field.input`, `form.isDirty` and the other getters are signal reads. Any component that called a Formisch hook (`useForm`/`useField`/`useFieldArray`, which run `useSignals`) re-renders when a signal it **read during render** changes. Docs: "There is no subscription API because none is needed. Reading `field.input` or any form state during render is automatically reactive." | `useSignals` (`index.js:418-437`), RHF migration guide |
| Granularity | Fine-grained. Writing one field notifies only readers of that signal. A component must itself call a Formisch hook to subscribe, and there is no `useWatch`-style hook | Internals guide, `index.js:418-437` |
| Dirty tracking | `isDirty`, `getDirtyInput`, `getDirtyPaths`, `pickDirty` | `index.d.ts:227-312,642-661` |
| Context | No `FormProvider`. You pass the store as a prop or through your own context | RHF migration guide |

### 1.6 React API surface (1.1.1)

- Hooks: `useForm(config)`, `useField(form, { path })`, `useFieldArray(form, { path })`.
- Components: `<Form of onSubmit ...formAttrs>`, `<Field of path>{(field) => ...}</Field>`, `<FieldArray of path>{(fa) => ...}</FieldArray>` (all headless render-props).
- `FieldStore`: `path, input, errors, isTouched, isEdited, isDirty, isValid, onChange(value), props { name, autoFocus, ref, onFocus, onChange, onBlur }`.
- `FormStore`: `isSubmitting, isSubmitted, isValidating, isTouched, isEdited, isDirty, isValid, errors` (root errors only).
- Methods: `focus, getDeepError(s), getDeepErrorEntr(y|ies), getDirtyInput, getDirtyPaths, getErrors, getInput, handleSubmit, insert, isDirty, isEdited, isTouched, isValid, move, pickDirty, remove, replace, reset, setErrors, setInput, submit, swap, validate`.
- Source: export list at `index.d.ts:1217`.

## 2. Constraints this puts on the Form Definition and Condition design

1. **One static schema per Form Definition.** The compiled Valibot schema must describe every Field that can ever exist, including Fields that are hidden or only reachable in some branch. Conditions cannot add or remove schema entries at runtime. Changing the definition means remounting the Renderer with a new `key`.
2. **Every Field needs a stable, unique data path that the schema owns.** Layout Elements (Section, Grid, Tabs, Wizard step) must not create path segments. A Field's path comes only from its own key plus enclosing nested-object and Repeater Elements. Two Fields must not bind the same path with incompatible types, because that throws.
3. **Disallowed Valibot shapes.** The compiler must not emit `record`, `object_with_rest`, `tuple_with_rest` or `promise`. Prefer `object`/`loose_object` over `strict_object` wherever a variant is involved.
4. **`required` Conditions compile into the schema, not the UI.** There are two compilation strategies:
   - **Discriminated** (`v.variant(key, [...])`). Use it when the Condition is "field X equals literal". The branch key must be a literal/picklist Field, and each branch is a non-strict `v.object`. All branches' Fields share one store, so the same path must have the same type across branches.
   - **General** (`v.pipe(v.object({... target: v.optional(T) ...}), v.forward(v.partialCheck([[dep...], [target]], pred, msg), [target]))`). The target Field is declared optional and becomes required through a forwarded check. `pred` must be built by the compiler from the serializable Condition AST. Never `eval` stored code (AGENTS.md).
   The `partialCheck` path list must name **every** Field the Condition reads, because Valibot only runs it when those paths are issue-free. Recommendation: use the general strategy for v1 and keep `variant` as an optimisation.
5. **`visible` Conditions are Renderer-only, but they must also gate validation.** Hidden Fields keep their values and are still parsed. So for every Field with a `visible` Condition, the compiler must also make the Field effectively optional when hidden (same `forward(partialCheck)` mechanism, predicate = visible AND required). Otherwise, hidden required Fields block submit with an invisible error. The definition needs an explicit **hidden-value policy**: either *keep* (submit whatever is in the store) or *clear/strip* (a `v.transform` on output, or a `setInput(..., undefined)` when the Field becomes hidden). Pick one for v1. Strip-on-output via the schema is the most portable, because the server re-runs the same schema.
6. **`disabled` is purely a Renderer concern.** Formisch has nothing for it. The Renderer evaluates the Condition and sets the `disabled` attribute. A disabled Field's value is still submitted and validated, so the definition should state whether disabled implies "skip validation" (same compilation as hidden) or not.
7. **Condition evaluation is Renderer-side and reactive.** The Renderer evaluates Conditions by reading the dependency paths with `getInput`/`useField` inside a component that uses a Formisch hook. It should subscribe at the smallest component that needs the result, for example a `ConditionGate` that calls `useField` for each dependency. Conditions should therefore declare their dependency paths explicitly (statically extractable from the AST) so both the schema compiler (`partialCheck` paths) and the Renderer (subscriptions) can use them.
8. **Repeater-relative paths.** Row paths are index-based and shift on move/swap/remove. Conditions inside a Repeater must reference siblings **relatively**, e.g. `$row.qty`, which the Renderer resolves with the current index, or compile to an item-level `v.pipe(itemObject, v.forward(v.partialCheck(...)))` inside `v.array(...)`. Conditions must never store absolute indices. Use `fieldArray.items` IDs as React keys, not as data identifiers. If rows need stable identity in submitted data, add an explicit hidden `id` Field.
9. **Wizard steps need our own partial validation.** Formisch validates the whole form and overwrites all field errors on every run. Options:
   - (a) One form plus compile-time per-step sub-schemas. On "Next", the Renderer runs `v.safeParseAsync(stepSchema, getInput(form))` itself and pushes the issues with `setErrors`. Caveat: the next whole-form run (revalidate on input) also writes errors to future-step Fields. Those Fields are unmounted and therefore invisible, but `form.isValid` reflects them.
   - (b) One Formisch form per step, which is upstream's current workaround (discussion #108). This breaks cross-step Conditions and a single submit.
   Recommendation: (a). It also means the compiler must emit a per-step schema, and **cross-step Conditions are only checkable at final submit or when both steps are in the step schema**. A Wizard step must be a Layout Element whose Fields can be enumerated statically.
10. **Errors from object-level checks.** Every cross-field rule the compiler emits must use `v.forward` to a concrete Field path. Otherwise the error lands in `form.errors` (root), and the Renderer must show a form-level error area.
11. **Initial values and empties.** Required strings start as `''` and other types as `undefined`, unless `emptyInput` overrides this. Definition-level default values should compile to `initialInput`, or to `v.optional(x, default)` when they must also apply server-side. Repeater initial row counts come from `initialInput` arrays. `reset({ initialInput })` supports "load existing answers, then edit".
12. **Validation mode is a form-level setting** (`validate`/`revalidate`). It is not per-Field. If the Form Definition exposes it, expose it as one form-level option.

## 3. Spot-check results

Script run against installed `@formisch/react@1.1.1/dist/internals.js` + `valibot@1.5.0`:

```
A false [ 'VAT required' ] null       // forward(partialCheck) on kind='company', vat missing → error on ['vat']
B false [ 'VAT required' ]            // still errors after editing another field (whole-form validation)
C keys [ 'kind', 'name', 'vat' ] {"kind":"person","name":"n","vat":""}   // variant: union of keys in store; inactive 'vat' input is ''
D true {"kind":"person","name":"n"}   // inactive-branch key stripped from output
E false [ 'VAT req' ]                 // switching kind → company: branch rule maps to ['vat']
F "record" schema is not supported    // createFormStore throws
```

## 4. Open questions for the spec

- Hidden-value policy: keep or strip on submit? (constraint 5)
- Does disabled imply "not validated"? (constraint 6)
- Should a Wizard "Next" validate only its own step, or that step plus all earlier steps? (constraint 9)
- Should we track upstream multi-step API work (discussion #108) and adopt it if it ships?
