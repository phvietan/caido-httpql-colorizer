<script setup lang="ts">
defineProps<{ ruleNames: string[] }>();
</script>

<template>
  <div
    v-if="ruleNames.length > 0"
    class="background-status"
    :title="`${ruleNames.join(', ')} is recoloring in background`"
  >
    <span class="dot"></span>
    {{ ruleNames.join(", ") }} is recoloring in background
  </div>
</template>
