import type { Filter } from "@caido/sdk-frontend";
import type { ColorRule, Settings } from "shared";

type PreparedSettings = { backend: Settings; errors: string[] };
const PRESET_REFERENCE =
  /(^|[\s(])preset\s*:\s*(?:"([^"]+)"|([A-Za-z0-9_-]+))/gi;

function presetNames(httpql: string): string[] {
  return [...httpql.matchAll(PRESET_REFERENCE)]
    .map((match) => match[2] ?? match[3] ?? "")
    .filter(Boolean);
}

export function missingPresetErrors(
  rules: readonly ColorRule[],
  filters: readonly Filter[],
): string[] {
  const available = new Set(
    filters.flatMap((filter) => [filter.alias, filter.name]),
  );
  return rules.flatMap((rule) =>
    presetNames(rule.httpql)
      .filter((name) => !available.has(name))
      .map(
        (name) =>
          `Rule "${rule.name}": preset "${name}" does not exist in this project.`,
      ),
  );
}

export function prepareBackendSettings(
  snapshot: Settings,
  filters: readonly Filter[],
): PreparedSettings {
  const queriesByName = new Map(
    filters.flatMap((filter) => [
      [filter.alias, String(filter.query)] as const,
      [filter.name, String(filter.query)] as const,
    ]),
  );
  const errors: string[] = [];
  const rules = snapshot.rules.map((rule) => {
    const missing: string[] = [];
    const httpql = rule.httpql.replace(
      PRESET_REFERENCE,
      (
        reference,
        prefix: string,
        quoted: string | undefined,
        bare: string | undefined,
      ) => {
        const name = quoted ?? bare ?? "";
        const query = queriesByName.get(name);
        if (!query) {
          missing.push(name);
          return reference;
        }
        return `${prefix}(${query})`;
      },
    );
    if (rule.enabled) {
      errors.push(
        ...missing.map(
          (name) =>
            `Rule "${rule.name}": preset "${name}" does not exist in this project.`,
        ),
      );
    }
    return missing.length > 0
      ? { ...rule, enabled: false }
      : { ...rule, httpql };
  });
  return {
    backend: { ...snapshot, rules },
    errors,
  };
}
