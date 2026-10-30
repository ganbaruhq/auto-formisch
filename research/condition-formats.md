# Serializable condition formats (AF-3)

Research for the Auto Formisch v1 spec. Question: how do existing form libraries express
"show / enable / require this field when ..." conditions? What happens to hidden fields'
values and validation? How do conditions reference fields inside repeaters? What are the
security risks? Retrieved 2026-10-30 from official docs and the libraries' own source code.
Anything not confirmed from a primary source is marked **unverified**.

Already decided for Auto Formisch, so taken as given here: Conditions are structured JSON,
never string expressions. Stored definitions are never evaluated as code. The Valibot schema
is compiled from the Definition and revalidates submissions on the server (Workers).
Conditions drive `visible`, `required` and `disabled`.

## 1. Comparison table

| | SurveyJS | RJSF (JSON Schema) | JSONLogic | JSON Forms rules | Filament (PHP) |
|---|---|---|---|---|---|
| Format | Expression **string** in JSON, e.g. `"age({birthdate}) >= 16"` | JSON Schema keywords: `dependencies`, `if/then/else`, restricted `oneOf` | JSON AST: `{"op": [args]}` | `rule: {effect, condition: {scope, schema}}`, where the condition is a JSON Schema | PHP closures `fn (Get $get) => ...`, not serializable |
| Effects | `visibleIf`, `enableIf`, `requiredIf` on questions/panels/pages; `choicesVisibleIf` etc. | Changes the schema itself (adds or requires properties) | Just evaluates to a value; the host decides the effect | `HIDE`, `SHOW`, `ENABLE`, `DISABLE` (no required) | `visible()`, `hidden()`, `disabled()`, `required()`, all closure-capable |
| Operators | `empty notempty`, `and or !`, `= != < <= > >=`, `+ - * / % ^`, `contains notcontains`, `anyof noneof allof` | Full JSON Schema (`const`, `enum`, `minimum`, `pattern`, `not`, ...) | `var missing missing_some if == === != !== ! !! or and > >= < <= max min + - * / % map filter reduce all none some merge in cat substr log` | Full JSON Schema on the scoped value | Arbitrary PHP |
| Functions | Built-ins (`iif`, `age`, `today`, `dateDiff`, `sumInArray`, ...) plus host-registered `registerFunction` | none (custom formats/keywords are host code) | Host-registered `add_operation` | none | n/a |
| Hidden value in submission | Removed, by default on complete (`clearInvisibleValues: "onComplete"`); also `onHidden`, `onHiddenContainer`, `none` | **Kept** by default; removed only with `omitExtraData` (+ `liveOmit`) | n/a | unverified | **Removed**: hidden is not dehydrated unless `dehydratedWhenHidden()` |
| Hidden validation | **Skipped**: panel/page validation skips `!element.isVisible` | Whatever the active schema says; data is validated against the whole schema | n/a | unverified | **Skipped**: `isNeitherDehydratedNorValidated()` is true when hidden and not `dehydratedWhenHidden` |
| Disabled | `enableIf` makes the field read-only | n/a (`ui:disabled` is static UI) | n/a | `DISABLE` effect | Not saved ("Disabling a field will prevent it from being saved") but still validated by default (`isValidatedWhenNotDehydrated = true`) |
| Repeater references | Absolute `{dpanel[0].q}`, `{dpanel[-1].q}`; relative `{panel.q}`, `{prevPanel.q}`, `{parentPanel.q}`, `{panelIndex}`; matrix `{row.col}` | Local only: `if` applies to the instance at the same location, so an item schema sees only that item | `var` with dot path (`"a.b"`, numeric index) from the data root; `map/all/some` change the scope to the element | `scope` is a JSON pointer such as `#/properties/x`; behavior in arrays unverified | `$get('field')` is scoped to the current item; `$get('../x')` goes up one level per `../` |
| Server enforcement | Client library; server re-check is up to the integrator | The same schema can be revalidated with Ajv server-side | Same rule JSON runs anywhere there is an interpreter | Ajv-based | Inherent: every closure runs on the server (Livewire) |
| Code-eval risk | Low: hand-written PEG-style parser to an operand tree, no `eval`/`new Function` in the expression code. Risk is the parser plus custom functions | Ajv **generates JS code** from schemas and "treats JSON schemas as trusted as your application code". Untrusted `pattern` can cause ReDoS. Needs CSP `unsafe-eval` unless precompiled | Low with the current lib, but json-logic-js had an arbitrary-code issue via the operations object (fixed 2021, `method` op removed) | Same as Ajv | None from data (conditions are code), and also **not storable** |

## 2. Per-library notes with sources

### SurveyJS
- Boolean expressions go in `visibleIf`, `enableIf` and `requiredIf` on questions, panels and pages. Item-level variants are `choicesVisibleIf`, `rowsVisibleIf` and `columnsVisibleIf` with `{item}`. The docs cover the full operator and function list and the dynamic-panel/matrix reference syntax (`{panel.q}`, `{prevPanel.q}`, `{parentPanel.q}`, `{dpanel[-1].q}`, `{row.col}`). Comparisons are case-sensitive. Source: https://surveyjs.io/form-library/documentation/design-survey/conditional-logic
- Custom functions come from `registerFunction({ name, func, isAsync })` in `survey-core`. The function is host code, and the definition only references it by name (same page).
- `clearInvisibleValues` takes `"onComplete"` (default), `"onHidden"`, `"onHiddenContainer"` or `"none"`. Source: https://surveyjs.io/form-library/documentation/api-reference/survey-data-model#clearInvisibleValues
- Invisible elements are not validated. `PanelModelBase.validateCore` has `if (!element.isVisible) continue;`. Source: https://github.com/surveyjs/survey-library/blob/master/packages/survey-core/src/panel.ts
- The expression parser is hand-written and follows a PEG grammar (`expressionParserCore.ts`). It builds `Operand` trees, and there is no `eval`/`new Function` in `expressions/`. Source: https://github.com/surveyjs/survey-library/tree/master/packages/survey-core/src/expressions

### RJSF / JSON Schema
- `dependencies` supports property dependencies (`credit_card: ['billing_address']`), schema dependencies (add properties or required ones when a key is present) and a "very restricted" value-based `oneOf` that applies only when exactly one branch matches. RJSF notes that `dependencies` is "not part of the latest JSON Schema spec". Source: https://rjsf-team.github.io/react-jsonschema-form/docs/json-schema/dependencies
- `if/then/else` is resolved from form data in `retrieveSchema` (`resolveCondition`). Source: https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/utils/src/schema/retrieveSchema.ts
- In JSON Schema, a failed `if` means `else` must be valid. A missing `then` or `else` behaves as `true`. `dependentRequired` and `dependentSchemas` are presence-based. Source: https://json-schema.org/understanding-json-schema/reference/conditionals
- Data for fields not in the current schema "will be retained by default". `omitExtraData` removes it on submit, and `liveOmit` removes it on change. Source: https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/form-props
- Ajv security: "Ajv treats JSON schemas as trusted as your application code". Ajv generates code, so a strict CSP needs `unsafe-eval` unless schemas are precompiled. Regexes in `pattern`/`format` can cause ReDoS. Untrusted schemas should be limited in size and depth. Source: https://ajv.js.org/security.html

### JSONLogic
- The operation list comes from https://jsonlogic.com/operations.html. JSONLogic has its own truthiness rules (`[]` is falsy, `"0"` is truthy). `and`/`or` return an operand, not a boolean.
- Reference implementation `var` (json-logic-js 2.0.5) splits on `.` and walks `data[key]` with no own-property check: https://github.com/jwadhams/json-logic-js/blob/master/logic.js
- Security history: PR #98 "The operations object could be exploited to run arbitrary code" was merged on 2021-03-30. The related release removed the `method` operation. Source: https://github.com/jwadhams/json-logic-js/pull/98
- The JSON Logic community org says "inconsistencies and ambiguities have emerged between different implementations" and plans a stricter spec and test suite. Source: https://github.com/json-logic/.github/blob/main/profile/README.md
- Other JSON-AST precedents:
  - JSON Forms rules use `{effect: HIDE|SHOW|ENABLE|DISABLE, condition: {scope, schema, failWhenUndefined?}}`. An undefined scope passes the schema unless `failWhenUndefined: true`. Source: https://jsonforms.io/docs/uischema/rules/
  - Form.io offers Simple conditions (when/eq/show), JSON Logic and raw JavaScript. It notes "JavaScript conditions require secure evaluation". Source: https://help.form.io/userguide/forms/form-building/logic-and-conditions

### Filament (v4)
- `live()` re-renders on change; `live(onBlur: true)` and `live(debounce: 500)` are variants. Without `live()`, dependent closures don't refresh. `hidden(fn (Get $get) => $get('role') !== 'staff')` is a typical condition, and `hiddenJs()`/`visibleJs()` are the client-only alternatives. When both `hidden` and `visible` are set, both must agree for the field to show. `disabled()` and `required()` accept closures. "Disabling a field will prevent it from being saved." "Even when a field is not saved, it is still validated." Source: https://filamentphp.com/docs/4.x/forms/overview
- In repeaters, `$get()` and `$set()` are scoped to the current item by default. `$get('../client_id')` goes up one level and `$get('../../client_id')` reaches the top level. `$get('')` returns the whole item. Source: https://filamentphp.com/docs/4.x/forms/repeater
- In the source, `isDehydratedWhenHidden` defaults to `false` and `isValidatedWhenNotDehydrated` to `true`. `isNeitherDehydratedNorValidated()` returns true when the field is hidden and not dehydrated-when-hidden. Validation rule collection skips those components and directly hidden child schemas. Sources: https://github.com/filamentphp/filament/blob/4.x/packages/schemas/src/Components/Concerns/HasState.php and https://github.com/filamentphp/filament/blob/4.x/packages/schemas/src/Concerns/CanBeValidated.php

## 3. Typical use cases (seen across the docs above)

1. **Show a follow-up on a choice**: "Other" leads to a "please specify" field; "Do you have pets?" set to Yes leads to the pet's age (RJSF `oneOf` example). Uses `eq` / `in`.
2. **Require when another field is set**: a billing address when a credit card is present (RJSF property dependency). Uses `notEmpty` and `required`.
3. **Role or type switch**: show staff-only fields when `role == 'staff'` (Filament example). Uses `eq` and `visible`.
4. **Thresholds**: age at least 16 or 18 (SurveyJS `age({birthdate}) >= 16`), a quantity range (JSON Forms `minimum`). Uses `gt/gte/lt/lte`; date-derived values need functions.
5. **Multi-select membership**: show when a checkbox group contains X (SurveyJS `contains`/`anyof`). Uses `contains` / `anyOf`.
6. **Lock in edit mode**: disable a field after creation (Filament `disabledOn('edit')`). This is context, not data, so it needs a context variable or should be out of scope.
7. **Inside a repeater row**: show a field in a row based on another field in the same row (sibling), or based on a top-level field (parent). Both SurveyJS and Filament support both directions.
8. **Combinations**: `A and (B or not C)`. Needs `and`, `or` and `not` with nesting.

## 4. Implications for Auto Formisch

**Recommended minimal v1 Condition AST** (JSON, versioned, interpreted by one pure evaluator in
`core` that is shared by the React renderer and the Worker):

- Combinators: `{ "all": [...] }`, `{ "any": [...] }`, `{ "not": cond }`, plus the constants `true`/`false`.
- Leaf comparisons: `{ "field": <path>, "op": <op>, "value"?: <literal> }` with `op` set to
  `eq | neq | in | notIn | gt | gte | lt | lte | empty | notEmpty | contains` (`contains` is for
  multi-select arrays). `value` is always a JSON literal, never another expression. That leaves out
  arithmetic, functions, string concatenation and regex, which avoids SurveyJS-style function sprawl
  and ReDoS. Field-to-field comparison is a deliberate v2 candidate.
- Typed by the referenced Field: the builder rejects `gt` on a boolean, a `value` outside the
  Field's enum, an unknown path or a cycle. These are load-time errors, in line with
  "reject unsupported behavior explicitly".
- Bound to effects per Element: `visibleWhen`, `requiredWhen`, `disabledWhen`. Only define
  required as a Condition. Don't also model it as schema surgery (RJSF style), because the
  compiled Valibot schema should stay one static object.
- Avoid JSONLogic's semantics as-is: its truthiness rules, `and`/`or` returning operands and
  implementation drift are extra surface. A JSONLogic-*shaped* subset is fine if export/import is
  wanted, but owning the evaluator removes the prototype-walk risk (`var` → `data[key]`). Use
  own-property lookup only and reject `__proto__`, `constructor` and `prototype` segments.

**Semantics questions to settle** (where libraries disagree):

1. **Hidden value on submit**: drop it (SurveyJS default, Filament) or keep it (RJSF default)?
   Suggestion: drop it on submit, and decide that both the client and the Worker strip hidden
   fields before `safeParse`, so a crafted payload can't smuggle hidden values in.
2. **Hidden validation**: skip it (SurveyJS, Filament)? Suggestion: yes. Hidden means neither
   validated nor stored. Implement this as "evaluate Conditions → strip hidden → validate", with
   per-field optionality decided by `requiredWhen`. Valibot needs a composition for this
   (e.g. object-level `v.partialCheck` + `v.forward`, https://valibot.dev/api/partialCheck/,
   or a per-request schema built from the evaluated state). That needs a spike.
3. **Disabled**: is the value submitted, and is it validated? Filament: not saved, still
   validated. Need a decision, and probably "disabled = submitted, read-only, server ignores
   client changes / uses stored default" or "not submitted".
4. **Hidden containers**: when a Layout (section/step) is hidden, are all its descendant Fields
   hidden? (SurveyJS has `onHiddenContainer`.) Suggestion: yes, visibility is inherited.
5. **Clear timing**: clear the value at the moment a field hides (SurveyJS `onHidden`) or keep it
   in the client state and only drop it on submit (`onComplete`)? Keeping it is better UX when a
   user toggles back and forth.
6. **Repeater paths**: absolute (`items[0].qty`), sibling-relative (Filament `$get('x')`), or
   parent (`../x`)? Suggestion for v1: a path is either absolute from the root (non-repeater
   fields only) or `{ "scope": "item" }`-relative to the current repeater row. No index
   addressing and no `prevPanel` in v1.
7. **Undefined / empty**: does `eq` against a missing value fail? (JSON Forms needs
   `failWhenUndefined`.) Define `empty` precisely: `undefined`, `''`, `[]`, and is `null`
   included? Is `false` empty? It should not be.
8. **Chained conditions**: may a Condition reference a Field that is itself hidden? Suggestion:
   a hidden field evaluates as empty (so dependants hide transitively), with evaluation in
   topological order and cycles rejected at build time.
9. **Context variables** (edit vs create mode, user role): out of scope for v1, or a whitelisted
   `context.*` namespace supplied by the host?
