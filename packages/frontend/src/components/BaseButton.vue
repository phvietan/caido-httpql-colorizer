<script setup lang="ts">
withDefaults(
    defineProps<{
        variant?: "default" | "primary" | "danger" | "subtle";
        compact?: boolean;
    }>(),
    { variant: "default", compact: false },
);

const variants = {
    default:
        "hc-border-[#39434f] hc-bg-[#222831] hc-text-[#d3d7dd] enabled:hover:hc-bg-[#2a323c]",
    primary:
        "hc-border-[#25895a] hc-bg-[#17663e] hc-text-[#d8ffe7] enabled:hover:hc-bg-[#1e7549]",
    danger: "hc-border-[#633a42] hc-bg-[#222831] hc-text-[#f0a5ad] enabled:hover:hc-border-[#874752] enabled:hover:hc-bg-[#382127] enabled:hover:hc-text-[#ffc1c7]",
    subtle: "hc-border-[#39434f] hc-bg-[#222831] hc-text-[#9ca5b1] enabled:hover:hc-bg-[#2a323c]",
};
</script>

<template>
    <button
        type="button"
        class="hc-cursor-pointer hc-rounded-md hc-border hc-border-solid hc-font-sans hc-text-[10px] hc-font-semibold disabled:hc-cursor-default disabled:hc-opacity-[0.55] focus-visible:hc-outline focus-visible:hc-outline-2 focus-visible:hc-outline-offset-2 focus-visible:hc-outline-accent"
        :class="[
            variants[variant],
            compact || variant === 'subtle'
                ? 'hc-h-[27px] hc-px-2'
                : 'hc-h-8 hc-px-[11px]',
        ]"
    >
        <slot />
    </button>
</template>
