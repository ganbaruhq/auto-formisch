# Releasing

This is the maintainer guide for publishing the Auto Formisch packages to npm. Contributors only need the [Changesets section of CONTRIBUTING.md](CONTRIBUTING.md#changesets).

## How a release works

Releases are automated with [Changesets](https://changesets.dev/) and [`.github/workflows/release.yml`](.github/workflows/release.yml). Nobody publishes from their own machine after the one-time setup below.

```text
PRs with changesets merged to main
        │
        ▼
Release workflow (mode: version)
  opens or updates the "chore: version packages" PR:
  bumps versions, writes CHANGELOG.md files, deletes the changesets
        │
        ▼  maintainer reviews and merges that PR
        │
Release workflow (mode: publish)
  pack:    install, build, typecheck, check, test, pack tarballs
  publish: npm publish via trusted publishing (OIDC, with provenance),
           push git tags, create GitHub releases
```

- **Published packages:** `auto-formisch-core`, `auto-formisch-json`, `auto-formisch-builder`, `auto-formisch-react`. The playground is private and never published.
- **Versioning:** all four share one version number (a "fixed" group in `.changeset/config.json`). A release always publishes all four.
- **Tags and releases:** each package gets a tag like `auto-formisch-core@0.1.0` and a matching GitHub release with its changelog.
- **When the workflow does nothing:** pushes to `main` with no pending changesets and no unpublished versions are a no-op. The whole workflow is also skipped unless the repository variable `RELEASES_ENABLED` is `true` (see step 5 below).

## One-time setup

Do these once, in this order, before the first automated release.

### 1. GitHub repository settings

- **Settings → Actions → General → Workflow permissions:** enable **Allow GitHub Actions to create and approve pull requests**. Without it, the workflow can't open the version PR.
- **Settings → Environments:** create an environment named `npm`. The publish job runs in it. Optionally add **Required reviewers** so every publish waits for a maintainer to approve it, and restrict **Deployment branches** to `main`.
- **Settings → Security → Private vulnerability reporting:** enable it. [SECURITY.md](SECURITY.md) tells reporters to use it.

### 2. npm account

- Use an npm account with two-factor authentication enabled. It will own the packages.
- Optional: create an npm organization and add other maintainers to it, so publishing rights don't depend on one person.

### 3. Bootstrap the packages on npm

npm trusted publishing is configured per package, in the package's settings on npmjs.com, so each package has to exist on npm before you can set it up. Create them by publishing the current `0.0.0` versions once, by hand, from an up-to-date `main`:

```bash
git switch main && git pull
```

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm check && pnpm test
```

```bash
npm login
```

```bash
pnpm --filter "./packages/*" publish --access public
```

`pnpm publish` replaces the `workspace:*` dependencies with real version numbers. Check the result on npm (`npm view auto-formisch-react`), then mark the bootstrap versions as superseded so nobody installs them by accident:

```bash
for pkg in core json builder react; do npm deprecate "auto-formisch-$pkg@0.0.0" "Bootstrap release. Use 0.1.0 or later."; done
```

If npm by now lets you add a trusted publisher to a package that doesn't exist yet, you can skip this step and add the trusted publishers straight away.

### 4. Configure trusted publishing

For each of the four packages, on npmjs.com open **Package → Settings → Trusted publishing → GitHub Actions** and enter:

| Field             | Value           |
| ----------------- | --------------- |
| Organization/user | `ganbaruhq`     |
| Repository        | `auto-formisch` |
| Workflow filename | `release.yml`   |
| Environment       | `npm`           |

Then, in the same settings page, set **Publishing access** to **Require two-factor authentication and disallow tokens**. From then on, only the release workflow on this repository can publish, and no long-lived npm token exists that could leak.

Trusted publishing also gives every release a [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) automatically. npm checks it against the `repository` field in each `package.json`, so keep that field pointing at this repository.

### 5. Turn on the release workflow

The workflow stays off until you finish the steps above, so it can't try to publish before npm is ready. Turn it on in **Settings → Secrets and variables → Actions → Variables** by adding a repository variable `RELEASES_ENABLED` with the value `true`. Set it to anything else later to pause releases without editing the workflow.

### 6. First automated release

An initial `minor` changeset is already in `.changeset/`. Start the workflow from **Actions → Release → Run workflow** on `main` (or push any commit to `main`). It opens the version PR for `0.1.0`; merge it, and CI publishes the first real release.

## Day-to-day releases

1. Merge feature and fix pull requests that include changesets.
2. The release workflow keeps the **chore: version packages** PR up to date with the combined bump and changelog. You don't have to release after every merge — let changes collect.
3. When you want to release, review that PR: check the version number and read the generated `CHANGELOG.md` entries as a user would. Edit the PR branch if wording needs fixing.
4. Merge it. The workflow builds, re-runs every check, publishes to npm, pushes tags, and creates GitHub releases. If the `npm` environment has required reviewers, approve the publish job when it asks.
5. Confirm the release: the workflow run is green, the GitHub releases exist, and `npm view auto-formisch-core version` shows the new version.

The version PR is opened with the workflow's own `GITHUB_TOKEN`, and GitHub doesn't start other workflows for events created by that token, so CI doesn't run on the version PR itself. That's acceptable because the publish path re-runs build, typecheck, check, and tests before packing. If you want CI checks on the version PR too, give `changesets/action/version` a GitHub App token through its `github-token` input.

## Prereleases

To publish test versions under the `next` dist-tag without touching `latest`:

```bash
pnpm changeset pre enter next
```

Commit the generated `.changeset/pre.json` and merge it. While pre mode is on, the version PR produces versions like `0.2.0-next.0`, published as `npm install auto-formisch-react@next`. When you're ready for the stable release:

```bash
pnpm changeset pre exit
```

Merge that, then merge the next version PR to publish the stable versions.

## When something goes wrong

- **Publish job failed partway.** Re-run the failed workflow run. The workflow compares local versions with npm and only publishes versions that aren't there yet, so re-running is safe.
- **Bad release shipped.** Don't unpublish: npm only allows it within 72 hours and it breaks anyone who already installed. Fix forward with a patch changeset, and deprecate the broken version:

  ```bash
  npm deprecate auto-formisch-json@0.3.0 "Broken definition parsing, use 0.3.1."
  ```

- **`ENEEDAUTH` or `E404` on publish.** Trusted publishing isn't matching. Check that the package's trusted publisher entry matches the table above exactly (workflow filename and environment are case-sensitive), and that the job still has `id-token: write`.
- **Release workflow shows every job as skipped.** `RELEASES_ENABLED` isn't set to `true` (step 5).
- **Version PR not opening.** Check the repository setting in step 1 and that the workflow run's `version` job ran (it only runs when changesets are pending).

## Verifying a published package

- **Provenance:** the npm package page shows a "Built and signed on GitHub Actions" badge linking to the exact workflow run and commit.
- **Signatures:** in any project that installs the packages, run `npm audit signatures` to verify registry signatures and provenance.
