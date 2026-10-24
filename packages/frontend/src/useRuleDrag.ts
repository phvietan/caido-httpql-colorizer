import { ref } from "vue";
import type { Ref } from "vue";
import type { Setting } from "shared";

export function useRuleDrag(settings: Ref<Setting>, selectedId: Ref<string | null>, saveSettings: () => void) {
  const draggedRuleId = ref<string | null>(null);
  const draggedGroupId = ref<string | null>(null);
  const dropTargetRuleId = ref<string | null>(null);
  const dropTargetGroupId = ref<string | null | undefined>(undefined);
  const dropPosition = ref<"before" | "after" | null>(null);
  const groupOrderTargetId = ref<string | null | undefined>(undefined);
  const groupDropPosition = ref<"before" | "after" | null>(null);

  function normalizeRuleOrder() {
    settings.value.orderRules();
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

  return {
    draggedRuleId, draggedGroupId, dropTargetRuleId, dropTargetGroupId, dropPosition,
    groupOrderTargetId, groupDropPosition, startRuleDrag, updateRuleDropTarget, finishRuleDrag,
    dropRule, handleSectionDrop, startGroupDrag, finishGroupDrag, updateSectionDropTarget,
  };
}
