import { computed, ref, watch } from "vue";
import type { ColorRule, RuleGroup, ValidationResult } from "shared";
import { useSDK } from "../sdk";
import { missingPresetErrors } from "../presets";
import { useRuleDrag } from "./useRuleDrag";
import type { useProjectSettings } from "./useProjectSettings";
import type { useRecolorize } from "./useRecolorize";

export function useRules(
  projects: ReturnType<typeof useProjectSettings>,
  colorizing: ReturnType<typeof useRecolorize>,
) {
  const sdk = useSDK();
  const { settings, currentProjectId } = projects;
  const { saveSettings } = colorizing;
  const selectedId = ref<string | null>(null);
  const validation = ref<ValidationResult | null>(null);
  const drag = useRuleDrag(settings, selectedId, saveSettings);
  const { finishRuleDrag, finishGroupDrag } = drag;
  const selectedRule = computed(
    () =>
      settings.value.rules.find((rule) => rule.id === selectedId.value) ?? null,
  );
  const ruleSections = computed(() => [
    ...settings.value.groups.map((group) => ({
      id: group.id as string | null,
      name: group.name,
      group,
      rules: settings.value.rules.filter((rule) => rule.groupId === group.id),
    })),
    {
      id: null,
      name: settings.value.groups.length > 0 ? "Ungrouped" : "",
      group: null,
      rules: settings.value.rules.filter((rule) => !rule.groupId),
    },
  ]);

  function newRule() {
    if (!currentProjectId.value) return;
    const rule: ColorRule = {
      id: crypto.randomUUID(),
      name: `Rule ${settings.value.rules.length + 1}`,
      httpql: 'req.host.cont:"example.com"',
      color: "#185A6C",
      enabled: true,
      groupId: null,
    };
    settings.value.rules.push(rule);
    selectedId.value = rule.id;
    validation.value = null;
    saveSettings();
  }

  function newGroup() {
    if (!currentProjectId.value) return;
    const group: RuleGroup = {
      id: crypto.randomUUID(),
      name: `Group ${settings.value.groups.length + 1}`,
    };
    settings.value.groups.push(group);
    saveSettings();
  }

  function groupAllEnabled(groupId: string): boolean {
    const rules = settings.value.rules.filter(
      (rule) => rule.groupId === groupId,
    );
    return rules.length > 0 && rules.every((rule) => rule.enabled);
  }

  function toggleGroup(groupId: string) {
    const rules = settings.value.rules.filter(
      (rule) => rule.groupId === groupId,
    );
    const enable = !rules.every((rule) => rule.enabled);
    for (const rule of rules) rule.enabled = enable;
    saveSettings();
  }

  function removeRule(ruleId: string | null = selectedId.value) {
    const index = settings.value.removeRule(ruleId);
    if (index < 0) return;
    if (selectedId.value === ruleId) {
      selectedId.value =
        settings.value.rules[Math.min(index, settings.value.rules.length - 1)]
          ?.id ?? null;
      validation.value = null;
    }
    finishRuleDrag();
    saveSettings();
  }

  function removeGroup(groupId: string) {
    if (!settings.value.removeGroup(groupId)) return;
    if (!settings.value.rules.some((rule) => rule.id === selectedId.value)) {
      selectedId.value = settings.value.rules[0]?.id ?? null;
      validation.value = null;
    }
    finishRuleDrag();
    finishGroupDrag();
    saveSettings();
  }

  watch(
    [currentProjectId, () => selectedRule.value?.id, () => selectedRule.value?.httpql],
    (_value, _previous, onCleanup) => {
      validation.value = null;
      if (!selectedRule.value) return;
      const rule = { ...selectedRule.value };
      let current = true;
      const timer = setTimeout(async () => {
        let result: ValidationResult;
        try {
          const errors = missingPresetErrors([rule], sdk.filters.getAll());
          result = errors.length > 0
            ? { ok: false, error: errors[0] ?? "Preset does not exist." }
            : await sdk.backend.validateHttpql(rule.httpql);
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (current) validation.value = result;
      }, 300);
      onCleanup(() => {
        current = false;
        clearTimeout(timer);
      });
    },
    { flush: "sync" },
  );

  function selectPreset(hex: string) {
    if (selectedRule.value) selectedRule.value.color = hex;
  }

  function copyRules() {
    const copied = projects.copyRules();
    if (!copied) return;
    selectedId.value = copied.rules[0]?.id ?? selectedId.value;
    validation.value = null;
    saveSettings();
  }

  watch(
    currentProjectId,
    () => {
      selectedId.value = settings.value.rules[0]?.id ?? null;
      validation.value = null;
      finishRuleDrag();
      finishGroupDrag();
    },
    { flush: "sync" },
  );
  return {
    selectedId,
    validation,
    selectedRule,
    ruleSections,
    newRule,
    newGroup,
    groupAllEnabled,
    toggleGroup,
    removeRule,
    removeGroup,
    selectPreset,
    copyRules,
    drag,
  };
}
