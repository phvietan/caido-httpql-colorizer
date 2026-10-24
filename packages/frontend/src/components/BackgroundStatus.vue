<script setup lang="ts">
defineProps<{ ruleNames: string[] }>();
</script>

<template>
    <div
        v-if="ruleNames.length > 0"
        class="hc-max-w-[360px] hc-truncate hc-text-[#929ba7] narrow:hc-hidden"
        :title="`${ruleNames.join(', ')} is recoloring in background`"
    >
        <span
            class="hc-mr-1.5 hc-inline-block hc-h-[7px] hc-w-[7px] hc-rounded-full hc-bg-accent hc-shadow-[0_0_8px_rgba(79,156,249,0.4)]"
        ></span>
        {{ ruleNames.join(", ") }} is recoloring in background
    </div>
</template>
