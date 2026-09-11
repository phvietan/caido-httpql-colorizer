# Contributor and maintainer guide

This file contains repository-specific instructions for contributors and coding agents. End users should use `README.md`.

## Development

Requirements: Node.js 20+, Corepack, and pnpm 9.

```bash
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

## Release process

The [release workflow](.github/workflows/release.yml) builds the plugin, signs `dist/plugin_package.zip` with Ed25519, and publishes `plugin_package.zip` plus `plugin_package.zip.sig` in an immutable GitHub Release.

One-time repository setup:

1. Generate a dedicated Ed25519 key pair.
2. Add the complete private PEM key as the GitHub Actions secret `PRIVATE_KEY`.
3. Add the corresponding public key to the plugin's entry in Caido's `plugin_packages.json`.
4. Enable GitHub **Immutable releases**.

For a one-command release:

```bash
./release.sh "feat: describe the next release"
```

The helper builds the current package, increments the patch version in `package.json` and `caido.config.ts`, rebuilds and verifies the manifest, commits the changes, pushes `main`, and starts the signed release workflow. It requires an authenticated GitHub CLI and the configured `PRIVATE_KEY` secret.

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

