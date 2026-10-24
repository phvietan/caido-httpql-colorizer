# HTTPQL Colorizer

Color-code Caido HTTP History rows with ordered HTTPQL rules.

HTTPQL Colorizer helps you visually separate interesting traffic—API hosts, error responses, authentication endpoints, static assets, or anything else HTTPQL can describe.

## Core features

- **Color traffic with HTTPQL.** Match hosts, paths, response codes, and other request or response properties. Rules can also reference your Caido filter presets.
- **Color existing and incoming traffic.** Apply rules to HTTP History with **Trigger colorizing**, then automatically color new responses using the active rules. Rescans show progress and remove colors previously applied by the plugin to rows that no longer match.
- **Keep rules separate for each project.** Every project has its own groups, rules, and enabled states. New projects start empty; switching back restores that project's settings.
- **Copy rules between projects.** Choose a source by project name, group count, and rule count, then copy all its groups and rules, including ungrouped rules. Copies are independent and start disabled.
- **Control rule priority and groups.** Drag rules and groups to reorder them or move rules between groups. Enable or disable individual rules or an entire group. Delete rules immediately; deleting a group asks for confirmation before removing its rules.
- **Choose your colors.** Use 32 built-in background colors or enter a custom `#RRGGBB` value.
- **Check HTTPQL while typing.** Expressions are validated automatically 300 ms after you stop typing, with valid/invalid feedback and warnings for missing filter presets.

## Usage

1. Open **HTTPQL Colorizer** from the Caido sidebar and select **+ New rule**.
2. Name the rule, enter an [HTTPQL expression](https://docs.caido.io/reference/httpql.html), and choose a background color. For example, `resp.code.gte:500` matches server errors.
3. Select **Trigger colorizing** to save your edits and apply the rules to existing HTTP History. New incoming responses are then colored automatically.

Rules run from top to bottom: the first enabled matching rule determines the row color. Grouped rules run before **Ungrouped** rules. Editing rules or switching projects does not automatically rescan existing traffic; select **Trigger colorizing** when you want to update it.

Caido keeps traffic-table text white; this plugin changes only the background. Filter presets belong to their project, so copied rules that reference presets need matching preset names or aliases in the destination project.

## Installation

1. Download `plugin_package.zip` from the [project's Releases page](https://github.com/phvietan/caido-httpql-colorizer/releases).
2. Open Caido's plugin manager.
3. Install the downloaded package.
4. Select **HTTPQL Colorizer** from the Caido sidebar.

## License

This project is available under the [MIT License](LICENSE). You may freely use, copy, modify, distribute, and sell it, provided the license notice is retained.
