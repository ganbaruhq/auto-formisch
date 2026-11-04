# Field values are locked at runtime with `lock()`, not declared in the Form Definition

A form often needs a value from the server that the person filling it in cannot change but that still drives Conditions, such as `type = company` controlling `taxId`. We bind these values at runtime with `lock(compiled, values)`, because the value belongs to one record while a Form Definition describes every record, and a compiled schema that sees only its input cannot know which value is correct. The result is used on both sides: the Renderer shows the Field read-only, and `prep` overwrites the input before evaluating Conditions, so a forged value cannot affect the server's result. `disabled` keeps its meaning of Inactive.

## Considered Options

- **`readOnly: true` in the Form Definition.** It looks like a guarantee, but the schema would still accept a forged value because it has no trusted value to compare against.
- **`disabled` reading its raw value.** This matches the screen, but lets a forged value drive Conditions on the server, which is why `disabled` is Inactive and reads as empty.
- **Merging on the server (`{ ...body, type }`) with a read-only override in the Renderer.** It adds no API, but the same value must be kept in step across `initialInput`, the override and the server, and nested paths must be set by hand.

## Consequences

A server that does not call `lock` gets no protection, so applications should build the form in one function shared by client and server, such as `formFor(record)`. Because Formisch ignores a schema that changes after mount, a new `lock` result needs a new `key` on `AutoForm`. A value read from a URL or other client input must never be passed to `lock`.
