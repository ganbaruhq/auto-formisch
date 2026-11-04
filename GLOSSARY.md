# Auto Formisch

A library that renders forms automatically on top of Formisch from a portable description, authored either in code or as stored JSON.

## Language

**Form Definition**:
The portable, versioned JSON document that fully describes one form. It is the single model shared by code authors, stored forms, and renderers.
_Avoid_: Form JSON, survey, schema (alone)

**Fluent Builder**:
The developer-facing TypeScript API that produces a Form Definition by composing functions and pipes, in the style of Valibot.
_Avoid_: Compiler, DSL

**Component**:
Any node in a Form Definition's tree.
_Avoid_: Element, question, control

**Field**:
A Component bound to a data path that contributes a value to the submission.
_Avoid_: Question, input

**Field Type**:
The kind of data a Field holds, named by its `type`. An application can register its own for values the built-in ones don't cover.
_Avoid_: Plugin, custom component

**Layout**:
A Component that only arranges other Components and holds no value of its own, such as a Section, Tabs, Tab, or Page.
_Avoid_: Panel, container

**Content**:
A Component that shows fixed text and neither holds a value nor arranges other Components.
_Avoid_: Static field, display field, paragraph

**Page**:
A Layout at the root of a multi-page form, shown one at a time. A form made of Pages is a Wizard.
_Avoid_: Step

**Repeater**:
A Field whose value is a list of objects, where each item follows the same template of Components.
_Avoid_: Dynamic panel, array field

**Rule**:
A serializable validation constraint declared on a Field. Whether a Field must be answered is not a Rule; that is its required setting.
_Avoid_: Validator

**Widget**:
The Renderer's UI control that presents a Field; swappable without changing the Form Definition.
_Avoid_: Input

**Condition**:
A serializable predicate over Field values that decides whether a Component is visible, or a Field is required or disabled.
_Avoid_: Expression, visibleIf

**Inactive**:
The state of a Field that a Condition or its setting has made hidden or disabled, directly or through an enclosing Component. An Inactive Field is not validated, contributes no value to the submission, and reads as empty to Conditions.
_Avoid_: Excluded, skipped

**Renderer**:
A framework-specific adapter that turns a Form Definition into an interactive form backed by Formisch.
_Avoid_: AutoForm (that is one React export), theme
