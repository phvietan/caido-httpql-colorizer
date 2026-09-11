import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  ApplyResult,
  ColorRule,
  RuleGroup,
  Settings,
  ValidationResult,
} from "shared";
import { useSDK } from "./sdk";

const RECOLOR_REQUIRED =
  "Does not automatically recolorize; click Trigger colorizing.";

export function useColorizer() {
  const sdk = useSDK();
  let applyRevision = 0;
  let storageWrites: Promise<void> = Promise.resolve();
  const settings = ref<Settings>({ enabled: true, groups: [], rules: [] });
  let projectListener: { stop(): void } | undefined;
  const selectedId = ref<string | null>(null);
  const recoloringRuleNames = ref<string[]>([]);
  const statusText = ref("");
  const validation = ref<ValidationResult | null>(null);
  const draggedRuleId = ref<string | null>(null);
  const draggedGroupId = ref<string | null>(null);
  const dropTargetRuleId = ref<string | null>(null);
  const dropTargetGroupId = ref<string | null | undefined>(undefined);
  const dropPosition = ref<"before" | "after" | null>(null);
  const groupOrderTargetId = ref<string | null | undefined>(undefined);
  const groupDropPosition = ref<"before" | "after" | null>(null);
  const progress = ref({ active: false, current: 0, total: 0, phase: "idle" as const });
  const progressPercent = computed(() => progress.value.total > 0
    ? Math.round((progress.value.current / progress.value.total) * 100)
    : 0);

  const selectedRule = computed(
    () => settings.value.rules.find((rule) => rule.id === selectedId.value) ?? null,
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

  function uid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function newRule() {
    const rule: ColorRule = {
      id: uid(), name: `Rule ${settings.value.rules.length + 1}`,
      httpql: 'req.host.cont:"example.com"', color: "#185A6C", enabled: true,
      groupId: null,
    };
    settings.value.rules.push(rule);
    selectedId.value = rule.id;
    validation.value = null;
  }

  function newGroup() {
    const group: RuleGroup = {
      id: uid(),
      name: `Group ${settings.value.groups.length + 1}`,
    };
    settings.value.groups.push(group);
    saveSettings();
  }

  function orderedRules(): ColorRule[] {
    const ordered = settings.value.groups.flatMap((group) =>
      settings.value.rules.filter((rule) => rule.groupId === group.id),
    );
    ordered.push(...settings.value.rules.filter((rule) => !rule.groupId));
    return ordered;
  }

  function normalizeRuleOrder() {
    settings.value.rules = orderedRules();
  }

  function groupAllEnabled(groupId: string): boolean {
    const rules = settings.value.rules.filter((rule) => rule.groupId === groupId);
    return rules.length > 0 && rules.every((rule) => rule.enabled);
  }

  function toggleGroup(groupId: string) {
    const rules = settings.value.rules.filter((rule) => rule.groupId === groupId);
    const enable = !rules.every((rule) => rule.enabled);
    for (const rule of rules) rule.enabled = enable;
    saveSettings();
  }

  function removeRule() {
    const index = settings.value.rules.findIndex((rule) => rule.id === selectedId.value);
    if (index < 0) return;
    settings.value.rules.splice(index, 1);
    selectedId.value = settings.value.rules[Math.min(index, settings.value.rules.length - 1)]?.id ?? null;
    validation.value = null;
    saveSettings();
  }

  function startRuleDrag(ruleId: string, event: DragEvent) {
    finishGroupDrag();
    draggedRuleId.value = ruleId;
    selectedId.value = ruleId;
    event.dataTransfer?.setData("text/plain", ruleId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function updateRuleDropTarget(ruleId: string, event: DragEvent) {
    if (!draggedRuleId.value || draggedRuleId.value === ruleId) {
      dropTargetRuleId.value = null;
      dropPosition.value = null;
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    dropTargetRuleId.value = ruleId;
    dropTargetGroupId.value = undefined;
    dropPosition.value = event.clientY < bounds.top + bounds.height / 2
      ? "before"
      : "after";
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function finishRuleDrag() {
    draggedRuleId.value = null;
    dropTargetRuleId.value = null;
    dropTargetGroupId.value = undefined;
    dropPosition.value = null;
  }

  function dropRule(ruleId: string) {
    const sourceId = draggedRuleId.value;
    const position = dropPosition.value;
    if (!sourceId || sourceId === ruleId || !position) {
      finishRuleDrag();
      return;
    }

    const sourceIndex = settings.value.rules.findIndex((rule) => rule.id === sourceId);
    const targetRule = settings.value.rules.find((rule) => rule.id === ruleId);
    if (sourceIndex < 0 || !targetRule) {
      finishRuleDrag();
      return;
    }
    const [rule] = settings.value.rules.splice(sourceIndex, 1);
    const targetIndex = settings.value.rules.findIndex((item) => item.id === ruleId);
    if (!rule || targetIndex < 0) {
      finishRuleDrag();
      return;
    }
    rule.groupId = targetRule.groupId;
    settings.value.rules.splice(
      targetIndex + (position === "after" ? 1 : 0),
      0,
      rule,
    );
    normalizeRuleOrder();
    finishRuleDrag();
    saveSettings();
  }

  function updateGroupDropTarget(groupId: string | null) {
    if (!draggedRuleId.value) return;
    dropTargetRuleId.value = null;
    dropTargetGroupId.value = groupId;
    dropPosition.value = null;
  }

  function dropRuleIntoGroup(groupId: string | null) {
    const sourceIndex = settings.value.rules.findIndex(
      (rule) => rule.id === draggedRuleId.value,
    );
    if (sourceIndex < 0) {
      finishRuleDrag();
      return;
    }
    const [rule] = settings.value.rules.splice(sourceIndex, 1);
    if (!rule) {
      finishRuleDrag();
      return;
    }
    rule.groupId = groupId;
    settings.value.rules.push(rule);
    normalizeRuleOrder();
    finishRuleDrag();
    saveSettings();
  }

  function startGroupDrag(groupId: string, event: DragEvent) {
    finishRuleDrag();
    draggedGroupId.value = groupId;
    event.dataTransfer?.setData("text/plain", groupId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function updateSectionDropTarget(
    sectionId: string | null,
    event: DragEvent,
  ) {
    if (!draggedGroupId.value) {
      updateGroupDropTarget(sectionId);
      return;
    }
    if (draggedGroupId.value === sectionId) {
      groupOrderTargetId.value = undefined;
      groupDropPosition.value = null;
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    groupOrderTargetId.value = sectionId;
    groupDropPosition.value = sectionId === null ||
      event.clientY < bounds.top + bounds.height / 2
        ? "before"
        : "after";
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function finishGroupDrag() {
    draggedGroupId.value = null;
    groupOrderTargetId.value = undefined;
    groupDropPosition.value = null;
  }

  function dropGroup(targetGroupId: string | null) {
    const sourceId = draggedGroupId.value;
    const position = groupDropPosition.value;
    if (!sourceId || sourceId === targetGroupId || !position) {
      finishGroupDrag();
      return;
    }
    const sourceIndex = settings.value.groups.findIndex(
      (group) => group.id === sourceId,
    );
    if (sourceIndex < 0) {
      finishGroupDrag();
      return;
    }
    const [group] = settings.value.groups.splice(sourceIndex, 1);
    if (!group) {
      finishGroupDrag();
      return;
    }
    if (targetGroupId === null) {
      settings.value.groups.push(group);
    } else {
      const targetIndex = settings.value.groups.findIndex(
        (item) => item.id === targetGroupId,
      );
      if (targetIndex < 0) {
        settings.value.groups.splice(sourceIndex, 0, group);
        finishGroupDrag();
        return;
      }
      settings.value.groups.splice(
        targetIndex + (position === "after" ? 1 : 0),
        0,
        group,
      );
    }
    normalizeRuleOrder();
    finishGroupDrag();
    saveSettings();
  }

  function handleSectionDrop(sectionId: string | null) {
    if (draggedGroupId.value) dropGroup(sectionId);
    else dropRuleIntoGroup(sectionId);
  }

  async function validate() {
    if (!selectedRule.value) return;
    validation.value = await sdk.backend.validateHttpql(selectedRule.value.httpql);
  }

  function selectPreset(hex: string) {
    if (selectedRule.value) selectedRule.value.color = hex;
  }

  async function updateProgress(revision: number) {
    try {
      const status = await sdk.backend.getBackendStatus();
      if (revision !== applyRevision) return;
      const backendProgress = status.progress;
      Object.assign(progress.value, backendProgress);
      if (!backendProgress.active) return;
      const label = backendProgress.phase === "clearing"
        ? "Clearing existing colors"
        : backendProgress.phase === "finding"
          ? "Finding matching requests"
          : "Colorizing";
      statusText.value = backendProgress.phase === "finding"
        ? label
        : `${label} ${backendProgress.current} / ${backendProgress.total}`;
    } catch {
      // Progress polling is best effort; the main RPC result remains authoritative.
    }
  }

  function snapshotSettings(): Settings {
    normalizeRuleOrder();
    return {
      enabled: true,
      groups: settings.value.groups.map((group) => ({ ...group })),
      rules: settings.value.rules.map((rule) => ({ ...rule })),
    };
  }

  function queueStorageWrite(snapshot: Settings): Promise<void> {
    const write = storageWrites.then(() => sdk.storage.set(snapshot));
    storageWrites = write.catch(() => undefined);
    return write;
  }

  function saveSettings() {
    const snapshot = snapshotSettings();
    const revision = ++applyRevision;
    recoloringRuleNames.value = [];
    progress.value = { ...progress.value, active: false, phase: "idle" };
    statusText.value = RECOLOR_REQUIRED;
    const storageWrite = queueStorageWrite(snapshot);
    void Promise.all([storageWrite, sdk.backend.setSettings(snapshot)]).catch(
      (error: unknown) => {
        if (revision !== applyRevision) return;
        statusText.value = error instanceof Error ? error.message : String(error);
        sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
      },
    );
  }

  function triggerColorizing() {
    const snapshot = snapshotSettings();
    const revision = ++applyRevision;
    const storageWrite = queueStorageWrite(snapshot);
    progress.value = { active: true, current: 0, total: 0, phase: "finding" };
    recoloringRuleNames.value = snapshot.enabled
      ? snapshot.rules
          .filter((rule) => rule.enabled && rule.httpql.trim())
          .map((rule) => rule.name)
      : [];
    statusText.value = "Re-evaluating HTTP History…";
    const progressPoller = setInterval(() => void updateProgress(revision), 250);
    void updateProgress(revision);
    void runColorizing(snapshot, revision, storageWrite, progressPoller);
  }

  async function runColorizing(
    snapshot: Settings,
    revision: number,
    storageWrite: Promise<void>,
    progressPoller: ReturnType<typeof setInterval>,
  ) {
    try {
      await Promise.all([
        storageWrite,
        sdk.backend.setSettings(snapshot),
      ]);
      if (revision !== applyRevision) return;
      const result: ApplyResult = await sdk.backend.recolorize();
      if (revision !== applyRevision || result.cancelled) return;
      if (result.errors.length > 0) {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}. ${result.errors.length} error(s) — see Caido logs.`;
        for (const error of result.errors) sdk.log.error(`[HTTPQL Colorizer] ${error}`);
      } else {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}.`;
      }
    } catch (error) {
      if (revision !== applyRevision) return;
      statusText.value = error instanceof Error ? error.message : String(error);
      sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
    } finally {
      clearInterval(progressPoller);
      if (revision === applyRevision) {
        recoloringRuleNames.value = [];
        progress.value = {
          ...progress.value,
          active: false,
          phase: "idle",
        };
      }
    }
  }

  function handleProjectChange(projectId: string | undefined) {
    applyRevision += 1;
    recoloringRuleNames.value = [];
    progress.value = { active: false, current: 0, total: 0, phase: "idle" };
    statusText.value = projectId ? RECOLOR_REQUIRED : "No active Caido project.";
  }

  function load() {
    const stored = sdk.storage.get() as Settings | undefined;
    if (stored && Array.isArray(stored.rules)) {
      const groups = Array.isArray(stored.groups) ? stored.groups : [];
      const groupIds = new Set(groups.map((group) => group.id));
      settings.value = {
        enabled: true,
        groups,
        rules: stored.rules.map((rule) => ({
          ...rule,
          groupId: rule.groupId && groupIds.has(rule.groupId) ? rule.groupId : null,
        })),
      };
    } else {
      newRule();
    }
    selectedId.value = settings.value.rules[0]?.id ?? null;
    saveSettings();
    projectListener = sdk.projects.onCurrentProjectChange((event) => {
      handleProjectChange(event.projectId);
    });
  }

  onMounted(() => void load());
  onBeforeUnmount(() => projectListener?.stop());
  return { settings, selectedId, recoloringRuleNames, statusText, validation,
    selectedRule, ruleSections, progress, progressPercent, draggedRuleId,
    draggedGroupId, dropTargetRuleId, dropTargetGroupId, dropPosition,
    groupOrderTargetId, groupDropPosition, newRule, newGroup,
    removeRule, groupAllEnabled, toggleGroup, startRuleDrag,
    updateRuleDropTarget, updateSectionDropTarget, finishRuleDrag, dropRule,
    handleSectionDrop, startGroupDrag, finishGroupDrag, validate, selectPreset, saveSettings,
    triggerColorizing };
}
