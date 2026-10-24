<script setup lang="ts">
defineProps<{ groupName: string; ruleCount: number }>();
const emit = defineEmits<{ confirm: []; close: [] }>();
</script>

<template>
  <div class="delete-group-modal">
    <p>Are you sure you want to delete group <strong>“{{ groupName }}”</strong> and its {{ ruleCount }} {{ ruleCount === 1 ? 'rule' : 'rules' }}?</p>
    <div class="delete-group-actions">
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn danger" @click="emit('confirm')">Delete group</button>
    </div>
  </div>
</template>

<style scoped>
.delete-group-modal {
  width: min(440px, 80vw);
  padding: 20px;
  overflow-wrap: anywhere;
}
.delete-group-modal p {
  margin: 0 0 20px;
}
.delete-group-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
