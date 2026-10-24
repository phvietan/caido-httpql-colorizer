<script setup lang="ts">
import type { ColorRule } from "shared";

defineProps<{
  rule: ColorRule;
  selected: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
}>();

const emit = defineEmits<{
  select: [];
  toggle: [];
  delete: [];
  dragStart: [event: DragEvent];
  dragOver: [event: DragEvent];
  drop: [];
  dragEnd: [];
}>();
</script>

<template>
  <div
    class="rule-card"
    role="button"
    tabindex="0"
    draggable="true"
    :class="{
      selected,
      disabled: !rule.enabled && rule.groupId !== null,
      dragging,
      'drop-before': dropBefore,
      'drop-after': dropAfter,
    }"
    @dragstart="emit('dragStart', $event)"
    @dragover.prevent.stop="emit('dragOver', $event)"
    @drop.prevent.stop="emit('drop')"
    @dragend="emit('dragEnd')"
    @click="emit('select')"
    @keydown.enter="emit('select')"
  >
    <span class="accent" :style="{ background: rule.color }"></span>
    <span class="rule-copy">
      <strong>{{ rule.name }}</strong>
      <small>{{ rule.httpql || "No HTTPQL expression" }}</small>
    </span>
    <label class="rule-toggle" title="Enable or disable rule" @click.stop>
      <input v-model="rule.enabled" type="checkbox" @change="emit('toggle')" />
      <span class="switch"></span>
    </label>
    <button type="button" class="delete-icon" :aria-label="`Delete rule ${rule.name}`" title="Delete rule" @click.stop="emit('delete')" @keydown.stop>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" />
      </svg>
    </button>
    <span class="drag-handle" title="Drag to reorder">⠿</span>
  </div>
</template>
