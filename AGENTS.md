# Contributor and maintainer guide

This file contains repository-specific instructions for contributors and coding agents. End users should use `README.md`.

## Development

Requirements: nvm, Node.js 24.22.1 (pinned in `.nvmrc`), Corepack, and pnpm 10 (pinned in `package.json`).

```bash
nvm install
nvm use
corepack enable
pnpm install
pnpm watch
```

Use Caido's Devtools plugin to connect to the development URL printed by `pnpm watch`.

Build a production package with:

```bash
pnpm build
```

The package is written to `dist/plugin_package.zip`.

Run the TypeScript tests with `pnpm test`, or a single suite with `pnpm test tests/validation.test.ts`. Vitest loads TypeScript and Vue components directly using `vitest.config.ts`. Tests are split by concern under `tests/`, with shared fixtures and setup in `tests/helpers/`.

## Release process

Every push to `main` starts the [release workflow](.github/workflows/release.yml). It installs dependencies, runs `pnpm typecheck` and `pnpm test`, increments the patch version in `package.json` and `caido.config.ts`, builds and verifies the package, signs it with Ed25519, and pushes the version commit before publishing an immutable GitHub Release with `plugin_package.zip` and `plugin_package.zip.sig`. Failed checks stop the release.

One-time repository setup:

1. Generate a dedicated Ed25519 key pair.
2. Add the complete private PEM key as the GitHub Actions secret `PRIVATE_KEY`.
3. Add the corresponding public key to the plugin's entry in Caido's `plugin_packages.json`.
4. Enable GitHub **Immutable releases**.
5. Allow GitHub Actions to push version commits to `main` (`contents: write` is set in the workflow; branch rules must also permit the bot).

To release, commit your changes and push `main`:

```bash
git push origin main
```

Release runs are serialized. The version commit uses `GITHUB_TOKEN`, so it does not trigger another release. If `main` advances while a run is building, its version push fails instead of overwriting newer changes; the next queued run checks out the latest `main`. Pull the bot's version commit with `git pull --ff-only` before your next push. You can also start the workflow manually on `main` to publish another patch release.

## Project structure

```text
packages/
├── backend/   # HTTPQL evaluation, metadata updates, live events, ownership tracking
├── frontend/  # Vue rule editor, groups, drag-and-drop, progress, Caido navigation
└── shared/    # Shared API contracts, data types, concurrency helpers
```

## Maintainer metadata

- Repository: https://github.com/phvietan/caido-httpql-colorizer
- Author: phvietan <phvietan@gmail.com>

