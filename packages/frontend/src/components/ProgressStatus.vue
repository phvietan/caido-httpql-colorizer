<script setup lang="ts">
defineProps<{
    active: boolean;
    current: number;
    total: number;
    percent: number;
}>();
</script>

<template>
    <div
        v-if="active"
        class="hc-flex hc-w-[min(260px,35vw)] hc-items-center hc-gap-[7px] hc-text-[10px] hc-text-[#aeb6c1]"
    >
        <div
            class="hc-h-1.5 hc-flex-1 hc-overflow-hidden hc-rounded-full hc-bg-[#2b323c]"
        >
            <div
                class="hc-h-full hc-rounded-[inherit] hc-bg-accent hc-transition-[width] hc-duration-200"
                :style="{ width: `${percent}%` }"
            ></div>
        </div>
        <small>{{ current }} / {{ total }}</small>
    </div>
</template>
