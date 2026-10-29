# Security policy

## Supported versions

Auto Formisch is below 1.0. Security fixes go into the latest published version only. Upgrade to the newest release to get them.

## Reporting a vulnerability

Please don't open a public issue, discussion, or pull request for a security problem.

Report it privately through GitHub instead: go to the repository's [Security tab](https://github.com/ganbaruhq/auto-formisch/security) and click **Report a vulnerability**. Include:

- the affected package and version,
- a minimal schema, definition, or code sample that shows the problem,
- what an attacker could do with it.

You can expect an acknowledgement within a few days. We'll keep you updated on the fix, credit you in the release notes if you'd like, and publish a security advisory once a fixed version is out.

## Scope

Issues that are especially in scope:

- A stored form definition that leads to code execution, prototype pollution, or other unintended behavior when deserialized.
- A definition that validates differently after a JSON round trip than the original schema, letting invalid data through.
- Rendered forms that inject unescaped content from a definition into the page.

Remember that browser validation is never a security boundary: always validate submissions again on the server, as the README describes.
