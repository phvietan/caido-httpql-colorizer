<script setup lang="ts">
import { COLOR_PRESETS } from "./colors";
import BackgroundStatus from "./components/BackgroundStatus.vue";
import ProgressStatus from "./components/ProgressStatus.vue";
import RulesPanel from "./components/RulesPanel.vue";
import RuleCard from "./components/RuleCard.vue";
import { useColorizer } from "./useColorizer";

const {
    settings,
    selectedId,
    recoloringRuleNames,
    statusText,
    validation,
    selectedRule,
    ruleSections,
    progress,
    progressPercent,
    draggedRuleId,
    draggedGroupId,
    dropTargetRuleId,
    dropTargetGroupId,
    dropPosition,
    groupOrderTargetId,
    groupDropPosition,
    newRule,
    newGroup,
    removeRule,
    groupAllEnabled,
    toggleGroup,
    startRuleDrag,
    updateRuleDropTarget,
    updateSectionDropTarget,
    finishRuleDrag,
    dropRule,
    handleSectionDrop,
    startGroupDrag,
    finishGroupDrag,
    validate,
    selectPreset,
    saveSettings,
    triggerColorizing,
} = useColorizer();
</script>

<template>
    <div class="page">
        <header class="topbar">
            <div class="brand">
                <div class="brand-icon">🎨</div>
                <div>
                    <h1>HTTPQL Colorizer</h1>
                    <p>
                        Caido traffic-table highlighting. First matching rule
                        wins.
                    </p>
                </div>
            </div>

            <div class="top-actions">
                <BackgroundStatus :rule-names="recoloringRuleNames" />
            </div>
        </header>

        <main class="workspace">
            <RulesPanel
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
                @rule-drag-start="startRuleDrag"
                @rule-drag-over="updateRuleDropTarget"
                @rule-drop="dropRule"
                @rule-drag-end="finishRuleDrag"
                @section-drag-over="updateSectionDropTarget"
                @section-drop="handleSectionDrop"
                @group-drag-start="startGroupDrag"
                @group-drag-end="finishGroupDrag"
            />

            <section v-if="selectedRule" class="editor panel">
                <div class="editor-scroll">
                    <div class="field">
                        <label>Rule name</label>
                        <input v-model="selectedRule.name" class="input" />
                    </div>

                    <div class="field">
                        <div class="field-label-row">
                            <label>HTTPQL expression</label>
                            <button class="btn subtle" @click="validate">
                                Validate
                            </button>
                        </div>

                        <textarea
                            v-model="selectedRule.httpql"
                            class="query"
                            spellcheck="false"
                            placeholder='req.host.cont:"example.com" AND resp.code.eq:200'
                        ></textarea>

                        <div
                            v-if="validation"
                            class="validation"
                            :class="{
                                valid: validation.ok,
                                invalid: !validation.ok,
                            }"
                        >
                            <template v-if="validation.ok"
                                >✓ Valid HTTPQL</template
                            >
                            <template v-else>✕ {{ validation.error }}</template>
                        </div>
                    </div>

                    <div class="field">
                        <div class="section-heading">
                            <div>
                                <label>Row background</label>
                                <small
                                    >32 presets for the row background. Caido
                                    keeps the row text white.</small
                                >
                            </div>

                            <div
                                class="mini-preview"
                                :style="{ background: selectedRule.color }"
                            >
                                GET&nbsp;&nbsp; /api/user/profile&nbsp;&nbsp;
                                200
                            </div>
                        </div>

                        <div class="palette">
                            <button
                                v-for="preset in COLOR_PRESETS"
                                :key="preset.hex"
                                class="swatch"
                                :class="{
                                    selected:
                                        selectedRule.color.toUpperCase() ===
                                        preset.hex,
                                }"
                                :style="{
                                    background: preset.hex,
                                    color: '#FFFFFF',
                                }"
                                @click="selectPreset(preset.hex)"
                            >
                                <span
                                    class="swatch-dot"
                                    :style="{
                                        background: '#FFFFFF',
                                    }"
                                ></span>
                                <span>{{ preset.name }}</span>
                                <span
                                    v-if="
                                        selectedRule.color.toUpperCase() ===
                                        preset.hex
                                    "
                                    class="check"
                                    >✓</span
                                >
                            </button>
                        </div>

                        <div class="custom-color">
                            <label>Custom background hex</label>
                            <input
                                v-model="selectedRule.color"
                                class="input mono"
                                placeholder="#185A6C"
                            />
                            <input
                                v-model="selectedRule.color"
                                type="color"
                                class="color-picker"
                            />
                        </div>
                    </div>
                </div>

                <div class="editor-footer">
                    <div class="footer-status">
                        <span>{{ statusText }}</span>
                        <ProgressStatus
                            :active="progress.active"
                            :current="progress.current"
                            :total="progress.total"
                            :percent="progressPercent"
                        />
                        <div class="footer-actions">
                            <button class="btn danger" @click="removeRule">
                                Delete
                            </button>
                            <button
                                class="btn primary trigger"
                                @click="triggerColorizing"
                            >
                                Trigger colorizing
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section v-else class="editor panel empty-editor">
                <div>
                    <div class="empty-icon">🎨</div>
                    <h2>No rule selected</h2>
                    <p>Create a rule to start highlighting HTTP History.</p>
                    <button class="btn primary" @click="newRule">
                        + New rule
                    </button>
                    <button
                        class="btn primary trigger"
                        @click="triggerColorizing"
                    >
                        Trigger colorizing
                    </button>
                </div>
            </section>
        </main>
    </div>
</template>

<style src="./App.css"></style>
