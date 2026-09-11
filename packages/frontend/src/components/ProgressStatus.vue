<script setup lang="ts">
defineProps<{
  active: boolean;
  current: number;
  total: number;
  percent: number;
}>();
</script>

<template>
  <div v-if="active" class="progress-status">
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: `${percent}%` }"></div>
    </div>
    <small>{{ current }} / {{ total }}</small>
  </div>
</template>
