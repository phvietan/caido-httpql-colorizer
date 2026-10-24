<script setup lang="ts">
import BaseButton from "./components/BaseButton.vue";
import { onBeforeUnmount, watch } from "vue";
import { colorsEqual } from "shared";
import { COLOR_PRESETS } from "./colors";
import BackgroundStatus from "./components/BackgroundStatus.vue";
import ProgressStatus from "./components/ProgressStatus.vue";
import RulesPanel from "./components/RulesPanel.vue";
import CopyRulesModal from "./components/CopyRulesModal.vue";
import DeleteGroupModal from "./components/DeleteGroupModal.vue";
import { showDialog } from "./dialogs";
import { useProjectSettings } from "./hooks/useProjectSettings";
import { useRecolorize } from "./hooks/useRecolorize";
import { useRules } from "./hooks/useRules";

const projectSettings = useProjectSettings();
const colorizing = useRecolorize(projectSettings);
const rules = useRules(projectSettings, colorizing);
const { settings, currentProjectId } = projectSettings;
const {
    selectedId,
    validation,
    selectedRule,
    ruleSections,
    newRule,
    newGroup,
    removeRule,
    groupAllEnabled,
    toggleGroup,
    selectPreset,
    drag,
} = rules;
const {
    recoloringRuleNames,
    statusText,
    progress,
    progressPercent,
    saveSettings,
    triggerColorizing,
} = colorizing;
const {
    draggedRuleId,
    draggedGroupId,
    dropTargetRuleId,
    dropTargetGroupId,
    dropPosition,
    groupOrderTargetId,
    groupDropPosition,
    startRuleDrag,
    updateRuleDropTarget,
    updateSectionDropTarget,
    finishRuleDrag,
    dropRule,
    handleSectionDrop,
    startGroupDrag,
    finishGroupDrag,
} = drag;
let copyDialog: { close(): void } | undefined;
let deleteGroupDialog: { close(): void } | undefined;

function openCopyRules() {
    copyDialog?.close();
    void projectSettings.loadCopyProjects();
    copyDialog = showDialog(
        CopyRulesModal,
        { projectSettings, onCopy: rules.copyRules, onClose: () => copyDialog?.close() },
        { title: "Copy rules", modal: true },
    );
}

function confirmDeleteGroup(groupId: string) {
    const group = settings.value.groups.find((group) => group.id === groupId);
    if (!group) return;
    const projectId = currentProjectId.value;
    deleteGroupDialog?.close();
    const dialog = showDialog(
        DeleteGroupModal,
        {
            groupName: group.name,
            ruleCount: settings.value.rules.filter(
                (rule) => rule.groupId === groupId,
            ).length,
            onClose: () => dialog.close(),
            onConfirm: () => {
                if (currentProjectId.value === projectId)
                    rules.removeGroup(groupId);
                dialog.close();
            },
        },
        { title: "Delete group", modal: true },
    );
    deleteGroupDialog = dialog;
}

function closeDialogs() {
    copyDialog?.close();
    deleteGroupDialog?.close();
}
watch(currentProjectId, closeDialogs);
onBeforeUnmount(closeDialogs);
</script>

<template>
    <div
        class="hc-page hc-flex hc-h-full hc-min-h-0 hc-flex-col hc-overflow-hidden hc-bg-canvas hc-text-[#e6e8eb] hc-font-sans hc-text-xs hc-leading-[1.35]"
    >
        <header
            class="hc-flex hc-min-h-[74px] hc-shrink-0 hc-items-center hc-justify-between hc-gap-5 hc-border-0 hc-border-b hc-border-solid hc-border-[#2a3038] hc-bg-[#101419] hc-px-[18px] hc-py-3.5"
        >
            <div class="hc-flex hc-min-w-0 hc-items-center hc-gap-3">
                <div class="hc-text-[29px]">🎨</div>
                <div>
                    <h1 class="hc-m-0 hc-mb-[3px] hc-text-base hc-font-bold">
                        HTTPQL Colorizer
                    </h1>
                    <p
                        class="hc-m-0 hc-truncate hc-text-muted narrow:hc-hidden"
                    >
                        Caido traffic-table highlighting. First matching rule
                        wins.
                    </p>
                </div>
            </div>

            <div class="hc-flex hc-items-center hc-gap-3">
                <BaseButton
                    :disabled="!currentProjectId"
                    @click="openCopyRules"
                >
                    Copy rules from other projects
                </BaseButton>
                <BackgroundStatus :rule-names="recoloringRuleNames" />
            </div>
        </header>

        <main
            class="hc-grid hc-min-h-0 hc-flex-1 hc-grid-cols-[minmax(245px,320px)_minmax(0,1fr)] hc-gap-3 hc-overflow-hidden hc-p-3 medium:hc-grid-cols-[minmax(220px,280px)_minmax(0,1fr)]"
        >
            <RulesPanel
                v-if="currentProjectId"
                :rules="settings.rules"
                :groups="settings.groups"
                :sections="ruleSections"
                :selected-id="selectedId"
                :dragged-rule-id="draggedRuleId"
                :dragged-group-id="draggedGroupId"
                :drop-target-rule-id="dropTargetRuleId"
                :drop-target-group-id="dropTargetGroupId"
                :drop-position="dropPosition"
                :group-order-target-id="groupOrderTargetId"
                :group-drop-position="groupDropPosition"
                :group-all-enabled="groupAllEnabled"
                @new-rule="newRule"
                @new-group="newGroup"
                @select="
                    (id) => {
                        selectedId = id;
                        validation = null;
                    }
                "
                @save="saveSettings"
                @toggle-group="toggleGroup"
                @delete-rule="removeRule"
                @delete-group="confirmDeleteGroup"
                @rule-drag-start="startRuleDrag"
                @rule-drag-over="updateRuleDropTarget"
                @rule-drop="dropRule"
                @rule-drag-end="finishRuleDrag"
                @section-drag-over="updateSectionDropTarget"
                @section-drop="handleSectionDrop"
                @group-drag-start="startGroupDrag"
                @group-drag-end="finishGroupDrag"
            />

            <section v-if="selectedRule" class="hc-flex hc-flex-col hc-panel">
                <div class="hc-min-h-0 hc-flex-1 hc-overflow-y-auto hc-p-3.5">
                    <div class="hc-mb-4">
                        <label class="hc-label hc-mb-1.5">Rule name</label>
                        <input
                            v-model="selectedRule.name"
                            class="hc-field-control hc-h-[35px] hc-px-2.5"
                        />
                    </div>

                    <div class="hc-mb-4">
                        <label class="hc-label hc-mb-1.5">HTTPQL expression</label>

                        <textarea
                            v-model="selectedRule.httpql"
                            class="hc-field-control hc-min-h-[105px] hc-resize-y hc-p-2.5 hc-font-mono hc-text-[11px] hc-leading-[1.55]"
                            spellcheck="false"
                            placeholder='req.host.cont:"example.com" AND resp.code.eq:200'
                        ></textarea>

                        <div
                            v-if="validation"
                            role="status"
                            class="hc-mt-1.5 hc-text-[9px]"
                            :class="{
                                'hc-text-[#62d68a]': validation.ok,
                                'hc-text-[#f87171]': !validation.ok,
                            }"
                        >
                            <template v-if="validation.ok"
                                >✓ Valid HTTPQL</template
                            >
                            <template v-else>✕ {{ validation.error }}</template>
                        </div>
                    </div>

                    <div class="hc-mb-4">
                        <div
                            class="hc-mb-[9px] hc-flex hc-items-end hc-justify-between hc-gap-3"
                        >
                            <div>
                                <label class="hc-label hc-mb-1.5"
                                    >Row background</label
                                >
                                <small
                                    class="hc-block hc-text-[9px] hc-text-[#798491]"
                                    >32 presets for the row background. Caido
                                    keeps the row text white.</small
                                >
                            </div>

                            <div
                                class="hc-min-w-[190px] hc-max-w-[270px] hc-whitespace-nowrap hc-rounded-[5px] hc-px-2.5 hc-py-[7px] hc-font-mono hc-text-[9px] hc-text-white hc-shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
                                :style="{ background: selectedRule.color }"
                            >
                                GET&nbsp;&nbsp; /api/user/profile&nbsp;&nbsp;
                                200
                            </div>
                        </div>

                        <div
                            class="hc-grid hc-grid-cols-[repeat(8,minmax(82px,1fr))] hc-gap-[7px] medium:hc-grid-cols-[repeat(6,minmax(82px,1fr))] narrow:hc-grid-cols-[repeat(4,minmax(82px,1fr))]"
                        >
                            <button
                                v-for="preset in COLOR_PRESETS"
                                :key="preset.hex"
                                class="hc-swatch hc-grid hc-h-[42px] hc-cursor-pointer hc-grid-cols-[auto_minmax(0,1fr)_auto] hc-items-center hc-gap-1.5 hc-rounded-md hc-border-2 hc-border-solid hc-border-transparent hc-px-2 hc-text-[9px] hc-font-semibold hc-text-white hc-shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16)] hover:-hc-translate-y-px"
                                :class="{
                                    'hc-selected': colorsEqual(
                                        selectedRule.color,
                                        preset.hex,
                                    ),
                                }"
                                :style="{ backgroundColor: preset.hex }"
                                @click="selectPreset(preset.hex)"
                            >
                                <span
                                    class="hc-h-2 hc-w-2 hc-rounded-full hc-bg-white hc-opacity-80"
                                ></span>
                                <span class="hc-truncate">{{
                                    preset.name
                                }}</span>
                                <span
                                    v-if="
                                        colorsEqual(
                                            selectedRule.color,
                                            preset.hex,
                                        )
                                    "
                                    class="hc-font-extrabold"
                                    >✓</span
                                >
                            </button>
                        </div>

                        <div
                            class="hc-mt-2.5 hc-grid hc-grid-cols-[auto_minmax(160px,280px)_34px] hc-items-center hc-gap-[9px]"
                        >
                            <label class="hc-label hc-mb-1.5"
                                >Custom background hex</label
                            >
                            <input
                                v-model="selectedRule.color"
                                class="hc-field-control hc-h-[35px] hc-px-2.5 hc-font-mono"
                                placeholder="#185A6C"
                            />
                            <input
                                v-model="selectedRule.color"
                                type="color"
                                class="hc-h-[34px] hc-w-[34px] hc-rounded-md hc-border hc-border-solid hc-border-line hc-bg-[#1b2129] hc-p-0.5"
                            />
                        </div>
                    </div>
                </div>

                <div
                    class="hc-flex hc-basis-20 hc-shrink-0 hc-items-center hc-justify-between hc-gap-[9px] hc-bg-panel hc-p-[9px]"
                >
                    <div
                        class="hc-flex hc-h-[62px] hc-min-w-0 hc-flex-1 hc-items-center hc-gap-3.5 hc-rounded-[7px] hc-border hc-border-solid hc-border-[#303843] hc-bg-[#12171c] hc-p-2.5"
                    >
                        <span
                            class="hc-min-w-0 hc-flex-1 hc-truncate hc-text-[#798491]"
                            >{{ statusText }}</span
                        >
                        <ProgressStatus
                            :active="progress.active"
                            :current="progress.current"
                            :total="progress.total"
                            :percent="progressPercent"
                        />
                        <div
                            class="hc-ml-auto hc-flex hc-shrink-0 hc-items-center hc-gap-2"
                        >
                            <BaseButton variant="danger" @click="removeRule()">
                                Delete
                            </BaseButton>
                            <BaseButton
                                variant="primary"
                                class="hc-min-w-[118px]"
                                @click="triggerColorizing"
                            >
                                Trigger colorizing
                            </BaseButton>
                        </div>
                    </div>
                </div>
            </section>

            <section
                v-else
                class="hc-flex hc-flex-col hc-panel !hc-grid hc-place-items-center hc-text-center hc-text-[#89939f]"
            >
                <div>
                    <div class="hc-text-[32px]">🎨</div>
                    <h2
                        class="hc-mb-1 hc-mt-[7px] hc-text-sm hc-font-semibold hc-text-[#d1d5db]"
                    >
                        No rule selected
                    </h2>
                    <p class="hc-m-0 hc-mb-3">
                        {{
                            currentProjectId
                                ? "Create a rule or copy rules from another project."
                                : "Open a Caido project to configure its rules."
                        }}
                    </p>
                    <BaseButton
                        variant="primary"
                        :disabled="!currentProjectId"
                        @click="newRule"
                    >
                        + New rule
                    </BaseButton>
                </div>
            </section>
        </main>
    </div>
</template>

<style src="./App.css"></style>
