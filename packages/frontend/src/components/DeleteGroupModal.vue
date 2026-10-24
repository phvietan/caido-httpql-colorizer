<script setup lang="ts">
import BaseButton from "./BaseButton.vue";
defineProps<{ groupName: string; ruleCount: number }>();
const emit = defineEmits<{ confirm: []; close: [] }>();
</script>

<template>
    <div class="hc-dialog hc-w-[min(440px,80vw)] hc-p-5 hc-break-words">
        <p class="hc-m-0 hc-mb-5">
            Are you sure you want to delete group
            <strong>“{{ groupName }}”</strong> and its {{ ruleCount }}
            {{ ruleCount === 1 ? "rule" : "rules" }}?
        </p>
        <div class="hc-flex hc-justify-end hc-gap-2">
            <BaseButton @click="emit('close')">Cancel</BaseButton>
            <BaseButton variant="danger" @click="emit('confirm')">
                Delete group
            </BaseButton>
        </div>
    </div>
</template>
