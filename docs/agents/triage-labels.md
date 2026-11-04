# Triage labels

The engineering skills refer to five canonical triage roles. In YouTrack project `AF`, represent them with these exact tag names.

| Canonical role    | YouTrack tag      | Meaning                                           |
| ----------------- | ----------------- | ------------------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer needs to evaluate the issue            |
| `needs-info`      | `needs-info`      | Waiting for information from the reporter         |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an autonomous agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation or action           |
| `wontfix`         | `wontfix`         | Will not be actioned                              |

Apply and remove these tags through `youtrack-quanglv`. YouTrack tags are shared across projects on this instance; reuse the existing tag rather than creating a near-duplicate. They describe triage readiness; the issue's State field controls whether work is open or resolved. Preserve unrelated tags.
