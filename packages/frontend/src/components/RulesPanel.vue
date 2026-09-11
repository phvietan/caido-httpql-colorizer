<script setup lang="ts">
import type { ColorRule, RuleGroup } from "shared";
import RuleCard from "./RuleCard.vue";

type Section = { id: string | null; name: string; group: RuleGroup | null; rules: ColorRule[] };
const props = defineProps<{
  rules: ColorRule[]; groups: RuleGroup[]; sections: Section[]; selectedId: string | null;
  draggedRuleId: string | null; draggedGroupId: string | null; dropTargetRuleId: string | null;
  dropTargetGroupId: string | null | undefined; dropPosition: "before" | "after" | null;
  groupOrderTargetId: string | null | undefined; groupDropPosition: "before" | "after" | null;
  groupAllEnabled: (id: string) => boolean;
}>();
const emit = defineEmits<{
  newRule: []; newGroup: []; select: [id: string]; save: []; toggleGroup: [id: string];
  ruleDragStart: [id: string, event: DragEvent]; ruleDragOver: [id: string, event: DragEvent];
  ruleDrop: [id: string]; ruleDragEnd: []; sectionDragOver: [id: string | null, event: DragEvent];
  sectionDrop: [id: string | null]; groupDragStart: [id: string, event: DragEvent]; groupDragEnd: [];
}>();
</script>

<template>
  <aside class="rules-panel panel">
    <div class="panel-title"><div><strong>Rules</strong><span class="count">{{ rules.length }}</span></div><div class="rule-list-actions">
      <button class="btn compact" @click="emit('newGroup')">+ Group</button>
      <button class="btn primary compact" @click="emit('newRule')">+ New rule</button>
    </div></div>
    <div class="rule-list">
      <section v-for="section in sections" :key="section.id ?? 'ungrouped'" class="rule-group" :class="{
        'drop-group': dropTargetGroupId === section.id, 'dragging-group': draggedGroupId === section.id,
        'group-drop-before': groupOrderTargetId === section.id && groupDropPosition === 'before',
        'group-drop-after': groupOrderTargetId === section.id && groupDropPosition === 'after',
      }" @dragover.prevent="emit('sectionDragOver', section.id, $event)" @drop.prevent="emit('sectionDrop', section.id)">
        <div v-if="section.group" class="group-header">
          <span class="group-drag-handle" title="Drag to reorder group" draggable="true" @dragstart.stop="emit('groupDragStart', section.group!.id, $event)" @dragend="emit('groupDragEnd')">⠿</span>
          <input v-model="section.group.name" class="group-name" @change="emit('save')" />
          <span>{{ section.rules.length }} rules</span>
          <button class="group-toggle" @click="emit('toggleGroup', section.group!.id)">{{ props.groupAllEnabled(section.group!.id) ? 'Disable all' : 'Enable all' }}</button>
        </div>
        <div v-else-if="section.name" class="group-header ungrouped"><strong>{{ section.name }}</strong></div>
        <RuleCard v-for="rule in section.rules" :key="rule.id" :rule="rule" :selected="selectedId === rule.id" :dragging="draggedRuleId === rule.id"
          :drop-before="dropTargetRuleId === rule.id && dropPosition === 'before'" :drop-after="dropTargetRuleId === rule.id && dropPosition === 'after'"
          @drag-start="emit('ruleDragStart', rule.id, $event)" @drag-over="emit('ruleDragOver', rule.id, $event)" @drop="emit('ruleDrop', rule.id)" @drag-end="emit('ruleDragEnd')"
          @select="emit('select', rule.id)" @toggle="emit('save')" />
        <div v-if="section.rules.length === 0 && (section.group || groups.length > 0)" class="group-empty">Drop rules here</div>
      </section>
      <div v-if="rules.length === 0" class="empty">No rules yet. Create one to get started.</div>
    </div>
    <div class="priority-note"><strong>Priority matters.</strong><span>Drag rules into order. Changes are saved but do not recolor automatically.</span></div>
  </aside>
</template>
