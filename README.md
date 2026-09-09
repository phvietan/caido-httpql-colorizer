# HTTPQL Colorizer

Color-code rows in Caido's HTTP History using ordered [HTTPQL](https://docs.caido.io/reference/httpql.html) rules.

HTTPQL Colorizer uses Caido's native request metadata to highlight traffic-table rows. It does not inspect or modify Caido's DOM, inject CSS, or change the Request and Response viewers.

## Features

- Match requests and responses with HTTPQL expressions
- Apply colors to both existing history and newly intercepted responses
- Order rules by priority—the first matching rule wins
- Enable or disable individual rules or the entire plugin
- Validate HTTPQL expressions before applying them
- Choose from 32 color presets or enter a custom hex color
- Track recoloring progress for large HTTP histories
- Clear colors previously applied by the plugin when rules change or the plugin is disabled

## Installation

### Install a release

1. Download `plugin_package.zip` from the project's releases.
2. Open Caido's plugin manager.
3. Install the downloaded package.
4. Select **HTTPQL Colorizer** from the Caido sidebar.

### Build from source

Requirements:

- Node.js 20 or later
- Corepack and pnpm 9

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

1. Open **HTTPQL Colorizer** from the sidebar.
2. Select **New rule**.
3. Give the rule a descriptive name.
4. Enter an HTTPQL expression and optionally select **Validate**.
5. Choose a preset or custom background color.
6. Select **Save rule** to save the configuration and recolor HTTP History.

Rules are evaluated from top to bottom. A request receives the color of the first enabled rule it matches, so place specific filters above broad ones. Use the arrow buttons to change priority.

Example rules:

```httpql
req.host.cont:"api.example.com" AND resp.code.gte:500
req.path.cont:"/admin"
resp.code.eq:404
```

HTTPQL fields and operators depend on the Caido version in use. See the [HTTPQL reference](https://docs.caido.io/reference/httpql.html) for the complete query syntax.

## How recoloring works

When settings are saved or the global toggle changes, the plugin:

1. Clears the row colors it previously applied.
2. Evaluates enabled rules against existing HTTP History.
3. Applies the first matching rule's color to each request.
4. Evaluates future traffic after a response is intercepted, allowing `resp.*` filters to work.

The plugin records only the request IDs it has colored in its own SQLite metadata table. Rule configuration is stored with Caido's frontend storage API.

> [!NOTE]
> Caido controls the traffic table's foreground color and renders row text in white. Darker background colors generally provide the best contrast.

## Development

Start a development build in watch mode:

```bash
pnpm watch
```

Run the TypeScript checks:

```bash
pnpm typecheck
```

Create a production package:

```bash
pnpm build
```

### Project structure

```text
packages/
├── backend/   # HTTPQL evaluation, request metadata updates, and ownership tracking
├── frontend/  # Vue rule editor and Caido navigation integration
└── shared/    # Shared API contracts, types, and concurrency helpers
```

## Implementation notes

- Existing traffic is queried in pages of 500 requests.
- Metadata updates are batched and applied concurrently.
- Invalid saved rules are reported in Caido's logs and do not stop other rules from being processed.
- Reapplying rules may take some time when HTTP History is large; progress is shown in the plugin UI.
- Only colors owned by this plugin are cleared during recalculation.

## Version

Current version: **1.0.1**

Version 1.0.1 fixes Vue page mounting for current Caido versions and corrects frontend storage API usage.
