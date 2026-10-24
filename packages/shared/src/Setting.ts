import type { ColorRule, RuleGroup, Settings } from "./index";
import { normalizeHex } from "./helpers";

export class Setting implements Settings {
  enabled: boolean;
  groups: RuleGroup[];
  rules: ColorRule[];

  constructor(input: Settings = { enabled: true, groups: [], rules: [] }) {
    const groups = (input.groups ?? []).map((group) => ({ ...group }));
    const groupIds = new Set(groups.map((group) => group.id));
    this.enabled = input.enabled;
    this.groups = groups;
    this.rules = input.rules.map((rule) => ({
      ...rule, groupId: rule.groupId && groupIds.has(rule.groupId) ? rule.groupId : null,
    }));
  }

  toJSON(): Settings {
    return {
      enabled: this.enabled,
      groups: this.groups.map((group) => ({ ...group })),
      rules: this.rules.map((rule) => ({ ...rule })),
    };
  }

  orderRules(): void {
    this.rules = [
      ...this.groups.flatMap((group) => this.rules.filter((rule) => rule.groupId === group.id)),
      ...this.rules.filter((rule) => !rule.groupId),
    ];
  }

  removeRule(ruleId: string | null): number {
    const index = this.rules.findIndex((rule) => rule.id === ruleId);
    if (index >= 0) this.rules.splice(index, 1);
    return index;
  }

  removeGroup(groupId: string): boolean {
    if (!this.groups.some((group) => group.id === groupId)) return false;
    this.groups = this.groups.filter((group) => group.id !== groupId);
    this.rules = this.rules.filter((rule) => rule.groupId !== groupId);
    return true;
  }

  static normalize(input: Settings): Setting {
    const groups = Array.isArray(input?.groups)
      ? input.groups.map((group) => ({
          id: String(group.id),
          name: String(group.name ?? "Group"),
        }))
      : [];
    const groupIds = new Set(groups.map((group) => group.id));
    return new Setting({
      enabled: Boolean(input?.enabled),
      groups,
      rules: Array.isArray(input?.rules)
        ? input.rules.map((rule) => ({
            id: String(rule.id),
            name: String(rule.name ?? "Rule"),
            httpql: String(rule.httpql ?? "").trim(),
            color: normalizeHex(rule.color),
            enabled: Boolean(rule.enabled),
            groupId: rule.groupId && groupIds.has(String(rule.groupId))
              ? String(rule.groupId)
              : null,
          }))
        : [],
    });
  }

  copyRules(uid: () => string): Setting {
    const groupIds = new Map(this.groups.map((group) => [group.id, uid()]));
    return new Setting({
      enabled: true,
      groups: this.groups.map((group) => ({ ...group, id: groupIds.get(group.id)! })),
      rules: this.rules.map((rule) => ({
        ...rule, id: uid(), enabled: false,
        groupId: rule.groupId ? groupIds.get(rule.groupId) ?? null : null,
      })),
    });
  }
}
