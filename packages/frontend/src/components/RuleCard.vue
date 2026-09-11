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
      disabled: !rule.enabled,
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
    <span class="drag-handle" title="Drag to reorder">⠿</span>
  </div>
</template>
