# HTTPQL Colorizer

Color-code Caido HTTP History rows with ordered HTTPQL rules.

HTTPQL Colorizer helps you visually separate interesting traffic—API hosts, error responses, authentication endpoints, static assets, or anything else HTTPQL can describe. It uses Caido's native request metadata, so colors appear directly in the HTTP History table without modifying Caido's DOM or injecting CSS.

## Features

### HTTPQL-based coloring

- Match requests and responses with [HTTPQL](https://docs.caido.io/reference/httpql.html).
- Use request and response fields in the same rule.
- Validate an HTTPQL expression before saving it.
- Apply rules to existing HTTP History and newly intercepted responses.
- Use 32 built-in background colors or enter any custom `#RRGGBB` color.
- Preview the selected color while editing a rule.

### Ordered rules and groups

- Drag rules to change their priority.
- Create named groups to organize related rules.
- Drag groups to reorder entire sections.
- Drag rules within a group, between groups, or into the **Ungrouped** section.
- Enable or disable each rule directly from the Rules panel.
- Enable or disable every rule in a group with one action.
- Add new rules at the bottom of **Ungrouped**.

Rules are evaluated in their displayed order and the first enabled matching rule wins. Groups are evaluated from top to bottom, rules inside each group are evaluated from top to bottom, and ungrouped rules are evaluated last.

### Controlled recoloring

- Saving, deleting, reordering, grouping, enabling, or disabling rules does not automatically rescan existing history.
- Use **Trigger colorizing** when you are ready to apply the current configuration.
- Continue editing or creating rules while recoloring runs in the background.
- See which rules are currently being evaluated.
- Track one global coloring total with the bottom progress indicator.
- Supersede outdated work when settings change or a newer recoloring run starts.
- Reconcile colors in one pass instead of clearing every previously colored row first.
- Clear colors only from rows previously owned by this plugin that no longer match a rule.

### Native Caido integration

- Color rows through Caido's request metadata API.
- Evaluate newly intercepted traffic after its response is available, allowing `resp.*` filters to work.
- Store settings with Caido's frontend storage API.
- Store only plugin-owned request IDs in the plugin's SQLite metadata table.
- Keep invalid saved rules from stopping valid rules from being processed.

## Installation

### Install a release

1. Download `plugin_package.zip` from the [project's Releases page](https://github.com/phvietan/caido-httpql-colorizer/releases).
2. Open Caido's plugin manager.
3. Install the downloaded package.
4. Select **HTTPQL Colorizer** from the Caido sidebar.

### Build from source

Requirements:

- Node.js 20 or later
- Corepack
- pnpm 9

```bash
corepack enable
pnpm install
pnpm build
```

Install the generated package from:

```text
dist/plugin_package.zip
```

## Usage

### Create a rule

1. Open **HTTPQL Colorizer** from the Caido sidebar.
2. Select **+ New rule** beside the Rules heading.
3. Enter a descriptive rule name.
4. Enter an HTTPQL expression.
5. Optionally select **Validate** to check the expression.
6. Select a preset color or enter a custom hex color.
7. Select **Save rule**.
8. Select **Trigger colorizing** when you want to update existing HTTP History.

Saving a rule updates the active configuration for future intercepted traffic, but it deliberately does not rescan existing history. **Trigger colorizing** saves the current configuration and explicitly starts that rescan.

### Organize rules

Select **+ Group** to create a group, then edit its name. Use the six-dot handles to:

- reorder groups;
- reorder rules inside a group;
- move rules between groups; or
- move a rule to or from **Ungrouped**.

Use each rule's switch to enable or disable it. Group headers provide **Enable all** and **Disable all** actions for every rule in that group.

Changes to order, grouping, and enabled state are saved immediately, but existing history is not recolored until you select **Trigger colorizing**.

### Understand priority

The displayed order is the evaluation order:

1. The first group and its rules, from top to bottom.
2. Each following group and its rules, from top to bottom.
3. Ungrouped rules, from top to bottom.

Once a request matches an enabled rule, later rules are ignored for that request. Put narrow, high-priority filters above broader fallback filters.

For example, an API server error rule should appear above a general API-host rule if the error traffic needs a different color.

### Example HTTPQL rules

```httpql
req.host.cont:"api.example.com" AND resp.code.gte:500
req.path.cont:"/admin"
resp.code.eq:404
```

Available fields and operators depend on your Caido version. See the [HTTPQL reference](https://docs.caido.io/reference/httpql.html) for the complete syntax.

## How recoloring works

When **Trigger colorizing** is selected, the plugin:

1. Takes a snapshot of the current groups, rule order, enabled states, expressions, and colors.
2. Evaluates enabled rules against existing HTTP History in priority order.
3. Assigns each request to the first matching rule.
4. Builds a combined action list containing color assignments and clears for plugin-owned rows that no longer match.
5. Resolves request metadata IDs and applies actions concurrently.
6. Updates the global progress indicator as actions complete.
7. Records the request IDs successfully colored by the plugin.

Existing history is queried newest-first in pages of 500, matching the table's top-to-bottom direction. Metadata actions are batched and processed with bounded concurrency to keep large histories responsive.

There is no separate clear-all phase. Rows that still match receive their correct color directly, while only stale plugin-owned rows are cleared. This avoids the startup delay and unnecessary work caused by loading and clearing all old colors before applying new ones.

If settings change during a scan, the current revision becomes outdated and stops at a safe boundary. A new explicit trigger uses the latest settings. Already-running Caido SDK operations are allowed to settle safely rather than being interrupted midway.

## Live traffic

The backend also listens for intercepted responses. After a response arrives, the request is checked against enabled rules in priority order and receives the first matching color.

This means:

- request-only and response-aware rules both work for new traffic;
- saved settings affect new traffic without requiring a full history rescan; and
- the manual trigger is needed only to reconcile existing HTTP History.

## Color ownership and storage

The plugin keeps a local record of request IDs it has colored. During recoloring, it uses that ownership list to remove colors only from its own stale rows.

Rule configuration—including groups, order, names, expressions, colors, and enabled states—is stored through Caido's frontend storage API. The SQLite metadata table stores request IDs only; it does not duplicate request or response contents.

> [!NOTE]
> Caido controls the traffic table's foreground color and normally renders row text in white. Darker background colors provide the best contrast.

## Development

Install dependencies:

```bash
pnpm install
```

Start a development build in watch mode:

```bash
pnpm watch
```

Install Caido's Devtools plugin, open it in Caido, and connect to the development URL printed by the watch command.

Create a production package:

```bash
pnpm build
```

The finished plugin archive is written to `dist/plugin_package.zip`.

### Publish a signed GitHub release

The [release workflow](.github/workflows/release.yml) follows Caido's package-signing process. It builds the plugin, signs `dist/plugin_package.zip` with Ed25519, and publishes both `plugin_package.zip` and `plugin_package.zip.sig` in an immutable GitHub Release.

Repository setup is required once:

1. Generate a dedicated Ed25519 key pair for this plugin.
2. Add the complete private PEM key as a GitHub Actions secret named `PRIVATE_KEY`.
3. Keep the public key for the plugin's entry in Caido's `plugin_packages.json`.
4. Enable **Immutable releases** under **GitHub → Settings → General → Releases**.

To publish a new version:

1. Update `version` in both `package.json` and `caido.config.ts`.
2. Commit and push the changes to `main`.
3. Open **GitHub → Actions → Release → Run workflow**.
4. Select the `main` branch and run the workflow.

The release tag is read from the built Caido manifest, keeping the release version synchronized with `caido.config.ts`. The private key exists only inside the release runner and is deleted immediately after signing.

### Project structure

```text
packages/
├── backend/   # HTTPQL evaluation, metadata updates, live events, and ownership tracking
├── frontend/  # Vue rule editor, groups, drag-and-drop, progress, and Caido navigation
└── shared/    # Shared API contracts, data types, and concurrency helpers
```

## Project

- Repository: `https://github.com/phvietan/caido-httpql-colorizer`
- Author: **phvietan**
- Email: `phvietan@gmail.com`
