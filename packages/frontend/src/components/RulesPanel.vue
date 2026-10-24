<script setup lang="ts">
import BaseButton from "./BaseButton.vue";
import type { ColorRule, RuleGroup } from "shared";
import RuleCard from "./RuleCard.vue";

type Section = {
    id: string | null;
    name: string;
    group: RuleGroup | null;
    rules: ColorRule[];
};
const props = defineProps<{
    rules: ColorRule[];
    groups: RuleGroup[];
    sections: Section[];
    selectedId: string | null;
    draggedRuleId: string | null;
    draggedGroupId: string | null;
    dropTargetRuleId: string | null;
    dropTargetGroupId: string | null | undefined;
    dropPosition: "before" | "after" | null;
    groupOrderTargetId: string | null | undefined;
    groupDropPosition: "before" | "after" | null;
    groupAllEnabled: (id: string) => boolean;
}>();
const emit = defineEmits<{
    newRule: [];
    newGroup: [];
    select: [id: string];
    save: [];
    toggleGroup: [id: string];
    deleteRule: [id: string];
    deleteGroup: [id: string];
    ruleDragStart: [id: string, event: DragEvent];
    ruleDragOver: [id: string, event: DragEvent];
    ruleDrop: [id: string];
    ruleDragEnd: [];
    sectionDragOver: [id: string | null, event: DragEvent];
    sectionDrop: [id: string | null];
    groupDragStart: [id: string, event: DragEvent];
    groupDragEnd: [];
}>();
</script>

<template>
    <aside class="hc-flex hc-flex-col hc-panel">
        <div
            class="hc-flex hc-h-[51px] hc-shrink-0 hc-items-center hc-justify-between hc-border-0 hc-border-b hc-border-solid hc-border-[#29303a] hc-px-[13px]"
        >
            <div>
                <strong class="hc-text-xs">Rules</strong
                ><span
                    class="hc-ml-1.5 hc-inline-flex hc-h-[18px] hc-w-5 hc-items-center hc-justify-center hc-rounded-full hc-bg-[#252c35] hc-text-[9px] hc-text-[#aab2bd]"
                    >{{ rules.length }}</span
                >
            </div>
            <div class="hc-flex hc-items-center hc-gap-1.5">
                <BaseButton compact @click="emit('newGroup')">
                    + Group
                </BaseButton>
                <BaseButton variant="primary" compact @click="emit('newRule')">
                    + New rule
                </BaseButton>
            </div>
        </div>
        <div class="hc-min-h-0 hc-flex-1 hc-overflow-y-auto hc-p-[9px]">
            <section
                v-for="section in sections"
                :key="section.id ?? 'ungrouped'"
                class="hc-rule-group hc-relative hc-mb-[9px] hc-rounded-lg hc-border hc-border-solid hc-border-transparent hc-p-[5px] hc-transition-colors hc-duration-[120ms]"
                :class="{
                    'hc-drop-group': dropTargetGroupId === section.id,
                    'hc-dragging-group':
                        draggedGroupId !== null &&
                        draggedGroupId === section.id,
                    'hc-group-drop-before':
                        groupOrderTargetId === section.id &&
                        groupDropPosition === 'before',
                    'hc-group-drop-after':
                        groupOrderTargetId === section.id &&
                        groupDropPosition === 'after',
                }"
                @dragover.prevent="emit('sectionDragOver', section.id, $event)"
                @drop.prevent="emit('sectionDrop', section.id)"
            >
                <div
                    v-if="section.group"
                    class="hc-grid hc-min-h-[31px] hc-grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] hc-items-center hc-gap-2 hc-mb-[5px] hc-px-[5px] hc-text-[9px] hc-text-[#77818d]"
                >
                    <span
                        class="hc-grid hc-h-[25px] hc-w-6 hc-select-none hc-place-items-center hc-text-[21px] hc-leading-none hc-text-[#8b96a3] hc-cursor-grab hover:hc-text-[#c4cbd4]"
                        title="Drag to reorder group"
                        draggable="true"
                        @dragstart.stop="
                            emit('groupDragStart', section.group!.id, $event)
                        "
                        @dragend="emit('groupDragEnd')"
                        >⠿</span
                    >
                    <input
                        v-model="section.group.name"
                        class="hc-min-w-0 hc-border-0 hc-border-b hc-border-solid hc-border-transparent hc-bg-transparent hc-font-sans hc-text-[11px] hc-font-bold hc-text-[#d5dae1] hc-outline-none focus:hc-border-accent"
                        @change="emit('save')"
                    />
                    <span>{{ section.rules.length }} rules</span>
                    <button
                        class="hc-h-[23px] hc-cursor-pointer hc-rounded-[5px] hc-border hc-border-solid hc-border-[#39434f] hc-bg-raised hc-px-[7px] hc-text-[9px] hc-text-[#aab3bf] hover:hc-bg-[#29313b]"
                        @click="emit('toggleGroup', section.group!.id)"
                    >
                        {{
                            props.groupAllEnabled(section.group!.id)
                                ? "Disable all"
                                : "Enable all"
                        }}
                    </button>
                    <button
                        type="button"
                        class="hc-delete-icon"
                        :aria-label="`Delete group ${section.group.name}`"
                        title="Delete group"
                        @click="emit('deleteGroup', section.group!.id)"
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
                            <path
                                d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6"
                            />
                        </svg>
                    </button>
                </div>
                <div
                    v-else-if="section.name"
                    class="hc-grid hc-min-h-[25px] hc-grid-cols-1 hc-items-center hc-gap-2 hc-mb-[5px] hc-px-[5px] hc-text-[9px] hc-text-[#929ca8] hc-uppercase hc-tracking-[0.08em]"
                >
                    <strong>{{ section.name }}</strong>
                </div>
                <RuleCard
                    v-for="rule in section.rules"
                    :key="rule.id"
                    :rule="rule"
                    :selected="selectedId === rule.id"
                    :dragging="draggedRuleId === rule.id"
                    :drop-before="
                        dropTargetRuleId === rule.id &&
                        dropPosition === 'before'
                    "
                    :drop-after="
                        dropTargetRuleId === rule.id && dropPosition === 'after'
                    "
                    @drag-start="emit('ruleDragStart', rule.id, $event)"
                    @drag-over="emit('ruleDragOver', rule.id, $event)"
                    @drop="emit('ruleDrop', rule.id)"
                    @drag-end="emit('ruleDragEnd')"
                    @select="emit('select', rule.id)"
                    @toggle="emit('save')"
                    @delete="emit('deleteRule', rule.id)"
                />
                <div
                    v-if="
                        section.rules.length === 0 &&
                        (section.group || groups.length > 0)
                    "
                    class="hc-grid hc-min-h-10 hc-place-items-center hc-rounded-md hc-border hc-border-dashed hc-border-[#313a45] hc-text-[9px] hc-text-[#626d79]"
                >
                    Drop rules here
                </div>
            </section>
            <div
                v-if="rules.length === 0"
                class="hc-px-2.5 hc-py-[25px] hc-text-center hc-text-[#7f8995]"
            >
                No rules yet. Create one to get started.
            </div>
        </div>
        <div
            class="hc-m-[9px] hc-h-[62px] hc-shrink-0 hc-rounded-[7px] hc-border hc-border-solid hc-border-[#303843] hc-bg-[#12171c] hc-p-2.5"
        >
            <strong class="hc-mb-0.5 hc-block hc-text-[10px]"
                >Priority matters.</strong
            ><span class="hc-block hc-text-[9px] hc-text-[#788390]"
                >Drag rules into order. Changes are saved but do not recolor
                automatically.</span
            >
        </div>
    </aside>
</template>
