# Issue tracker: YouTrack

Issues and specs for this repo live in the **Auto Formisch** project (`AF`) at https://quanglv.youtrack.cloud. GitHub (`ganbaruhq/auto-formisch`) hosts the code and pull requests; do not file GitHub issues.

## Connection and project scope

- Use the `youtrack-quanglv` MCP connection in Codex and Claude Code.
- Scope searches to `project: AF`; pass `project: "AF"` when creating issues and `projectKey: "AF"` when reading project settings or field schemas.
- `youtrack-izone` is a separate IZONE instance. This repo's tickets belong to `youtrack-quanglv`.
- Treat `AF-123` as a YouTrack issue ID.

## Ticket operations

- **Read**: `get_issue` with `issueId`, plus `get_issue_comments` when full discussion history is needed.
- **Search**: `search_issues` with a project-scoped query, for example `project: AF #Unresolved`.
- **Create**: read `get_issue_fields_schema` first, then use `create_issue` with the verified Type, Priority and State values. Preserve the issue template when the project provides one. Write the summary in English and the description in Vietnamese.
- **Edit**: `update_issue` for the summary, description or custom fields; pass only fields being changed.
- **Comment**: `add_issue_comment`; preserve relevant context and links.
- **Tags**: `manage_issue_tags`, using the mapping in `docs/agents/triage-labels.md`. Reuse exact tag names. If a tag is absent, create it through the authenticated YouTrack API when authorized; otherwise report the missing tag.
- **Assign**: resolve the user's YouTrack login, then use `change_issue_assignee`.
- **Resolve**: read the current State schema and select a resolved state matching the outcome. The project currently has `Open`, `In Progress`, `In Review`, `On hold`, `Done`, `Fixed` and `Canceled`; open work starts in `Open`. Re-read the schema before relying on these values.

## VCS integration (commits and PRs)

The YouTrack VCS integration links commits and PRs to issues and can drive state changes without opening the YouTrack UI. It is configured in YouTrack (`quanglv.youtrack.cloud`, project `AF`), not in this repo. As of 2026-10-30 it has not been verified for `AF`: confirm the integration, its monitored branches and command processing in YouTrack before relying on commit commands.

- **Mention** an issue with `AF-123` or its issue URL in narrative text. Reserve `#AF-123` for command lines: in commit messages, YouTrack parses text after a prefixed ID through the end of that line as a command.
- **Commands** go on their own line: `#AF-123 In Progress`, `#AF-123 Done`. A command line contains only the issue ID and the verified state/field change, with no bullet, code fence, explanation, or PR number.
- **Commands run from commits**: YouTrack ignores commands in PR titles and descriptions. It applies commands from pushed commit messages, subject to the VCS integration's branch, author mapping, and Committers permissions. See [YouTrack VCS behavior](https://www.jetbrains.com/help/youtrack/cloud/vcs-changes.html#pull-requests).
- **Close on merge**: follow the procedure below. YouTrack executes the command only once it is present in a pushed commit; GitHub must preserve it when merging.

Conventions:

- Prefix the ID with `#` only when applying a command.
- When a PR finishes a ticket, keep the title concise and put the closing command on its own line, last in the PR description.
- Reserve all closing commands (`Done`, `Fixed`, or another resolved state) for the PR description when the ticket should resolve only after merge. Commands in individual pushed commits can resolve it early.
- Multiple tickets, one per line:
  ```
  #AF-123 Done
  #AF-124 Done
  ```
- For related work with no state change, mention the ID without a command.
- Verify the State schema before relying on a command value (see **Ticket operations**); the state name must match the project's configured values.

### Close a ticket when its PR merges

1. Read the project's current State schema and select the resolved state matching the outcome (`Done` for completed work).
2. Keep the PR title in English with no closing command. End the Vietnamese PR description with one plain command line per completed ticket, for example `#AF-123 Done`. Keep related tickets as plain mentions. The command examples above are fenced for documentation only; actual PR command lines must be outside Markdown fences and comments.
3. Before merging, check the live repository settings:
   ```sh
   gh api repos/ganbaruhq/auto-formisch --jq '{merge_commit_title,merge_commit_message,squash_merge_commit_title,squash_merge_commit_message}'
   ```
   Both title settings must be `PR_TITLE`; both message settings must be `PR_BODY`. On 2026-10-30 they were not (`MERGE_MESSAGE`/`PR_TITLE` and `COMMIT_OR_PR_TITLE`/`COMMIT_MESSAGES`), so the PR description would be dropped; until they are changed, pass the PR body as an explicit merge message override. Use merge or squash and preserve the command lines in the final commit message, including when using CLI message overrides. Rebase does not copy the PR description. GitHub can append `(#PR)` to commit titles, so a title ending in `#AF-123 Done` can become the invalid command `#AF-123 Done (#PR)`.
4. After an authorized merge, inspect the actual resulting commit and read the issue's State:
   ```sh
   gh pr view <PR_NUMBER> --json mergeCommit --jq '.mergeCommit.oid'
   gh api repos/ganbaruhq/auto-formisch/commits/<MERGE_SHA> --jq '.commit.message'
   ```
   Confirm every closing command appears intact on its own line. Allow YouTrack to process the commit and re-read the ticket before reporting that it closed. A linked or merged PR alone does not prove a command ran.

If a command is missing from an old merge, editing the merged PR description does not change its commit. Report the affected tickets and use the ticket resolution workflow when authorized; do not rewrite shared history to repair closure. If the command is present but the State is unchanged, inspect the YouTrack VCS activity for command/author errors and check the integration's enabled project, branch filters, command processing, author mapping, and Committers permissions. Keep unverified server errors separate from confirmed commit-message problems.

The commit author must match a YouTrack user in the configured Committers group by email or VCS username. When GitHub uses a noreply email, add the author's GitHub **Name** to the user's VCS usernames in YouTrack. See JetBrains' [Apply Commands in VCS Commits](https://www.jetbrains.com/help/youtrack/cloud/apply-commands-in-vcs-commits.html). Importing historical commits can replay commands; review the affected history before using the integration's import action.

This covers the YouTrack↔GitHub link only, not custom GitHub Actions; any workflow added under `.github/workflows/` should reference this doc for mention/command syntax.

## When a skill says "publish to the issue tracker"

Create an issue in YouTrack project `AF` using `youtrack-quanglv`.

## When a skill says "fetch the relevant ticket"

Read the `AF-...` issue and its comments from `youtrack-quanglv`.

## Wayfinding operations

- **Map**: one parent issue tagged `wayfinder:map`, with Notes, Decisions so far and Fog in its description. Use a Type supported by the project: `Milestone` for the map and `Task` (or `Subtask`) for child tickets.
- **Child ticket**: create with `parentIssue` set to the map, or use `link_issues` with the verified subtask link type. Keep tags `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task` as appropriate.
- **Blocking**: use native YouTrack issue links. Inspect the available link types before writing; preserve the direction so a blocked ticket points to its blocker.
- **Frontier**: fetch unresolved children of the map, exclude tickets with an unresolved blocker or an assignee, then choose the first eligible ticket in map order.
- **Claim**: assign the ticket to the authenticated user before implementation.
- **Resolve**: record the result, transition the ticket to a matching resolved state, and add a concise decision with a link to the map.
