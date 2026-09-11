# HTTPQL Colorizer

Color-code Caido HTTP History rows with ordered HTTPQL rules.

HTTPQL Colorizer helps you visually separate interesting traffic—API hosts, error responses, authentication endpoints, static assets, or anything else HTTPQL can describe.

## Features

### HTTPQL-based coloring

- Match requests and responses with [HTTPQL](https://docs.caido.io/reference/httpql.html).
- Use request and response fields in the same rule.
- Apply rules to existing HTTP History and newly intercepted responses.
- Use 32 built-in background colors or enter any custom `#RRGGBB` color.

### Ordered rules and groups

- Drag rules to change their priority.
- Create named groups to organize related rules.
- Drag groups or rules to reorder them, move rules between groups, or place them in **Ungrouped**.
- Toggle individual rules or all rules in a group.

Rules run from top to bottom; the first enabled match determines the row color. Groups run before **Ungrouped** rules.

### Live and controlled recoloring

- Changes do not rescan existing history automatically. Select **Trigger colorizing** to apply them.
- Continue editing or creating rules while recoloring runs in the background.
- See which rules are currently being evaluated.
- Newly intercepted responses are colored automatically.
- Switching projects does not automatically rescan history; click **Trigger colorizing** for the active project.

## Installation

### Install a release

1. Download `plugin_package.zip` from the [project's Releases page](https://github.com/phvietan/caido-httpql-colorizer/releases).
2. Open Caido's plugin manager.
3. Install the downloaded package.
4. Select **HTTPQL Colorizer** from the Caido sidebar.

## Usage

1. Open **HTTPQL Colorizer** from the Caido sidebar.
2. Select **+ New rule**, enter an HTTPQL expression, and choose a row color.
3. Select **Save rule**. Saved rules apply to new traffic automatically.
4. Drag rules or groups to set priority, and use the switches to enable or disable them.
5. Select **Trigger colorizing** to apply the current rules to existing HTTP History.

Saving changes does not recolor existing history until you select **Trigger colorizing**.

### Understand priority

Rules are evaluated in the order shown: groups from top to bottom, then their rules, followed by **Ungrouped** rules. The first enabled match determines the color.

## License

This project is available under the [MIT License](LICENSE). You may freely use, copy, modify, distribute, and sell it, provided the license notice is retained.
