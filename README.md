# HTTPQL Colorizer

Color-code Caido HTTP History rows with ordered HTTPQL rules.

HTTPQL Colorizer helps you visually separate interesting traffic—API hosts, error responses, authentication endpoints, static assets, or anything else HTTPQL can describe.

## Features

### How HTTPQL colorize your traffic

- Create a rule, then define a [HTTPQL](https://docs.caido.io/reference/httpql.html) to match a traffic rows. **You can even use your filter presets**
- Choose 32 built-in background colors or enter any custom `#RRGGBB` color.
- Edit your rules, then select **Trigger colorizing** to save the changes and apply the colors.
- Applied rules will colorize traffic in HTTP History and all new incoming traffics.
- Drag rules to change their priority.
- Create groups to organize related rules.
- Drag groups or rules to reorder them, move rules between groups, or place them in **Ungrouped**.
- Toggle each rules or all rules in group(s).
- Delete individual rules directly from their cards without a prompt. Deleting a group asks for confirmation with its name and rule count, then removes the group and all its rules.
- Each project has its own groups, rules, and enabled states. New projects start empty; switching back restores that project's settings, including edits made before switching.
- Select **Copy rules from other projects** to open the copy dialog. The source-project dropdown shows each project's name, group count, and rule count. Choose a project, then select **Copy all rules** to append all its groups and rules, including ungrouped rules. Copies have independent IDs and start disabled.

Caveats:

- Rules run from top to bottom; the first enabled match determines the row color. All groups run before **Ungrouped** rules.
- Can only edit the background color of traffics because of Caido API limitation, text of Caido traffic is always white.
- However, presets are project-based. A rule that uses a preset from project A will not work in another project unless that project has a preset with the same name or alias.

## Installation

1. Download `plugin_package.zip` from the [project's Releases page](https://github.com/phvietan/caido-httpql-colorizer/releases).
2. Open Caido's plugin manager.
3. Install the downloaded package.
4. Select **HTTPQL Colorizer** from the Caido sidebar.

## License

This project is available under the [MIT License](LICENSE). You may freely use, copy, modify, distribute, and sell it, provided the license notice is retained.
