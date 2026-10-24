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
        class="hc-rule-card hc-relative hc-mb-[7px] hc-grid hc-h-[58px] hc-w-full hc-cursor-pointer hc-grid-cols-[4px_minmax(0,1fr)_auto_auto_auto] hc-items-stretch hc-gap-2.5 hc-rounded-[7px] hc-border hc-border-solid hc-border-[#323a45] hc-bg-raised hc-pr-2.5 hc-text-left hover:hc-bg-[#252c35]"
        role="button"
        tabindex="0"
        draggable="true"
        :class="{
            'hc-selected': selected,
            'hc-disabled': !rule.enabled && rule.groupId !== null,
            'hc-dragging': dragging,
            'hc-drop-before': dropBefore,
            'hc-drop-after': dropAfter,
        }"
        @dragstart="emit('dragStart', $event)"
        @dragover.prevent.stop="emit('dragOver', $event)"
        @drop.prevent.stop="emit('drop')"
        @dragend="emit('dragEnd')"
        @click="emit('select')"
        @keydown.enter="emit('select')"
    >
        <span
            class="hc-rounded-l-md"
            :style="{ background: rule.color }"
        ></span>
        <span class="hc-min-w-0 hc-self-center">
            <strong class="hc-mb-1 hc-block hc-truncate hc-text-[11px]">{{
                rule.name
            }}</strong>
            <small
                class="hc-block hc-truncate hc-font-mono hc-text-[9px] hc-leading-[1.2] hc-text-[#8c96a2]"
                >{{ rule.httpql || "No HTTPQL expression" }}</small
            >
        </span>
        <label
            class="hc-flex hc-cursor-pointer hc-items-center hc-gap-[9px] hc-self-center"
            title="Enable or disable rule"
            @click.stop
        >
            <input
                v-model="rule.enabled"
                type="checkbox"
                class="hc-sr-only"
                :aria-label="`Enable rule ${rule.name}`"
                @change="emit('toggle')"
            />
            <span
                class="hc-rule-switch hc-relative hc-h-[15px] hc-w-[25px] hc-flex-none hc-rounded-full hc-bg-[#3a414b] hc-shadow-[inset_0_0_0_1px_#49515c]"
            ></span>
        </label>
        <button
            type="button"
            class="hc-delete-icon"
            :aria-label="`Delete rule ${rule.name}`"
            title="Delete rule"
            @click.stop="emit('delete')"
            @keydown.stop
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
            >
                <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" />
            </svg>
        </button>
        <span
            class="hc-grid hc-h-[34px] hc-w-[25px] hc-cursor-grab hc-select-none hc-place-items-center hc-self-center hc-text-[23px] hc-leading-none hc-text-[#8b96a3] hover:hc-text-[#c4cbd4]"
            title="Drag to reorder"
            >⠿</span
        >
    </div>
</template>
