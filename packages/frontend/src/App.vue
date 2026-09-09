<script setup lang="ts">
import { COLOR_PRESETS } from "./colors";
import { useColorizer } from "./useColorizer";

const {
    settings, selectedId, busy, saved, statusText, validation, selectedRule,
    progress, progressPercent,
    newRule, removeRule, move, validate, selectPreset, saveAndApply, toggleGlobal,
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
                        Native Caido traffic-table highlighting. First matching
                        rule wins.
                    </p>
                </div>
            </div>

            <div class="top-actions">
                <label class="global-toggle">
                    <input
                        v-model="settings.enabled"
                        type="checkbox"
                        @change="toggleGlobal"
                    />
                    <span class="switch"></span>
                    <span>
                        <strong>{{
                            settings.enabled ? "Enabled" : "Disabled"
                        }}</strong>
                        <small>Color matching rows in HTTP History</small>
                    </span>
                </label>

                <div class="save-state" :class="{ ok: saved }">
                    <span class="dot"></span>
                    {{ busy ? "Applying…" : saved ? "Saved" : statusText }}
                </div>

                <div v-if="progress.active" class="progress-status">
                    <div class="progress-track">
                        <div
                            class="progress-fill"
                            :style="{ width: `${progressPercent}%` }"
                        ></div>
                    </div>
                    <small>{{ progress.current }} / {{ progress.total }}</small>
                </div>

                <button class="btn primary" :disabled="busy" @click="newRule">
                    + New rule
                </button>
            </div>
        </header>

        <main class="workspace">
            <aside class="rules-panel panel">
                <div class="panel-title">
                    <div>
                        <strong>Rules</strong>
                        <span class="count">{{ settings.rules.length }}</span>
                    </div>
                    <small>FIRST MATCH WINS</small>
                </div>

                <div class="rule-list">
                    <button
                        v-for="(rule, index) in settings.rules"
                        :key="rule.id"
                        class="rule-card"
                        :class="{
                            selected: selectedId === rule.id,
                            disabled: !rule.enabled,
                        }"
                        @click="
                            selectedId = rule.id;
                            validation = null;
                        "
                    >
                        <span
                            class="accent"
                            :style="{ background: rule.color }"
                        ></span>
                        <span class="rule-copy">
                            <strong>{{ rule.name }}</strong>
                            <small>{{
                                rule.httpql || "No HTTPQL expression"
                            }}</small>
                        </span>
                        <span class="priority">{{
                            String(index + 1).padStart(2, "0")
                        }}</span>
                    </button>

                    <div v-if="settings.rules.length === 0" class="empty">
                        No rules yet. Create one to get started.
                    </div>
                </div>

                <div class="priority-note">
                    <strong>Priority matters.</strong>
                    <span>Put specific filters above broad filters.</span>
                </div>
            </aside>

            <section v-if="selectedRule" class="editor panel">
                <div class="editor-head">
                    <label class="enabled-row">
                        <input v-model="selectedRule.enabled" type="checkbox" />
                        <span class="switch"></span>
                        <span>
                            <strong>Enabled</strong>
                            <small>Use this rule when evaluating traffic</small>
                        </span>
                    </label>

                    <div class="editor-actions">
                        <button
                            class="icon-btn"
                            title="Move up"
                            @click="move(-1)"
                        >
                            ↑
                        </button>
                        <button
                            class="icon-btn"
                            title="Move down"
                            @click="move(1)"
                        >
                            ↓
                        </button>
                        <button
                            class="icon-btn danger"
                            title="Delete"
                            @click="removeRule"
                        >
                            ✕
                        </button>
                    </div>
                </div>

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
                                    >32 presets for the native row background.
                                    Caido keeps the row text white.</small
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
                                class="native-picker"
                            />
                        </div>
                    </div>

                    <div class="native-note">
                        <strong>Native Caido row background</strong>
                        <p>
                            This plugin never edits HTTP History DOM/CSS. It
                            sets Caido request metadata, so only the
                            traffic-table row background is highlighted. Request and
                            Response viewers are untouched.
                        </p>
                    </div>
                </div>

                <div class="editor-footer">
                    <span>{{ statusText }}</span>
                    <button
                        class="btn primary save"
                        :disabled="busy"
                        @click="saveAndApply"
                    >
                        {{ busy ? "Applying…" : "Save rule" }}
                    </button>
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
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
* {
    box-sizing: border-box;
}

.page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--c-bg-default, #111418);
    color: var(--c-fg-default, #e6e8eb);
    font:
        12px/1.35 Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
}

.topbar {
    flex: 0 0 auto;
    min-height: 74px;
    padding: 14px 18px;
    border-bottom: 1px solid #2a3038;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    background: #101419;
}

.brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.brand-icon {
    font-size: 29px;
}

h1 {
    font-size: 16px;
    margin: 0 0 3px;
    font-weight: 700;
}

.brand p {
    margin: 0;
    color: #9199a5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.top-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.global-toggle,
.enabled-row {
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
}

.global-toggle input,
.enabled-row input {
    display: none;
}

.global-toggle strong,
.enabled-row strong {
    display: block;
    font-size: 11px;
}

.global-toggle small,
.enabled-row small {
    display: block;
    color: #7f8895;
    font-size: 9px;
}

.switch {
    width: 31px;
    height: 17px;
    border-radius: 999px;
    position: relative;
    background: #3a414b;
    box-shadow: inset 0 0 0 1px #49515c;
    flex: none;
}

.switch::after {
    content: "";
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #c3c8cf;
    position: absolute;
    top: 2px;
    left: 2px;
    transition:
        transform 0.15s ease,
        background 0.15s ease;
}

input:checked + .switch {
    background: #17663e;
    box-shadow: inset 0 0 0 1px #25895a;
}

input:checked + .switch::after {
    transform: translateX(14px);
    background: #86efac;
}

.save-state {
    max-width: 260px;
    color: #929ba7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.save-state .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 6px;
    background: #64748b;
}

.save-state.ok .dot {
    background: #38c172;
    box-shadow: 0 0 8px rgba(56, 193, 114, 0.4);
}

.progress-status {
    width: 150px;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #aeb6c1;
    font-size: 10px;
}

.progress-track {
    flex: 1;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: #2b323c;
}

.progress-fill {
    height: 100%;
    border-radius: inherit;
    background: #4f9cf9;
    transition: width 0.2s ease;
}

.workspace {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(245px, 320px) minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
}

.panel {
    min-height: 0;
    border: 1px solid #2b323c;
    border-radius: 9px;
    background: #161b21;
    overflow: hidden;
}

.rules-panel {
    display: flex;
    flex-direction: column;
}

.panel-title {
    height: 51px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 13px;
    border-bottom: 1px solid #29303a;
}

.panel-title strong {
    font-size: 12px;
}

.panel-title small {
    font-size: 8px;
    letter-spacing: 0.14em;
    color: #6f7885;
    font-weight: 700;
}

.count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 6px;
    width: 20px;
    height: 18px;
    border-radius: 999px;
    background: #252c35;
    color: #aab2bd;
    font-size: 9px;
}

.rule-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 9px;
}

.rule-card {
    width: 100%;
    height: 58px;
    position: relative;
    display: grid;
    grid-template-columns: 4px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: stretch;
    margin-bottom: 7px;
    padding: 0 10px 0 0;
    border: 1px solid #323a45;
    border-radius: 7px;
    background: #20262e;
    color: inherit;
    text-align: left;
    cursor: pointer;
}

.rule-card:hover {
    background: #252c35;
}

.rule-card.selected {
    border-color: #3778c8;
    box-shadow: 0 0 0 1px rgba(55, 120, 200, 0.25);
    background: #222b36;
}

.rule-card.disabled {
    opacity: 0.55;
}

.accent {
    border-radius: 6px 0 0 6px;
}

.rule-copy {
    min-width: 0;
    align-self: center;
}

.rule-copy strong,
.rule-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rule-copy strong {
    font-size: 11px;
    margin-bottom: 4px;
}

.rule-copy small {
    font:
        9px/1.2 ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
    color: #8c96a2;
}

.priority {
    align-self: center;
    color: #697480;
    font-size: 9px;
}

.priority-note {
    flex: 0 0 auto;
    margin: 9px;
    padding: 10px;
    border: 1px solid #303843;
    border-radius: 7px;
    background: #12171c;
}

.priority-note strong,
.priority-note span {
    display: block;
}

.priority-note strong {
    font-size: 10px;
    margin-bottom: 2px;
}

.priority-note span {
    color: #788390;
    font-size: 9px;
}

.editor {
    display: flex;
    flex-direction: column;
}

.editor-head {
    flex: 0 0 57px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    border-bottom: 1px solid #29303a;
    background: #171c22;
}

.editor-actions {
    display: flex;
    gap: 6px;
}

.icon-btn {
    width: 30px;
    height: 30px;
    border: 1px solid #343d49;
    border-radius: 6px;
    background: #222831;
    color: #aeb6c1;
    cursor: pointer;
}

.icon-btn:hover {
    background: #29313b;
}

.icon-btn.danger:hover {
    color: #fecaca;
    border-color: #7f1d1d;
    background: #3a171b;
}

.editor-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
}

.field {
    margin-bottom: 16px;
}

.field > label,
.field-label-row label,
.section-heading label,
.custom-color label {
    display: block;
    margin-bottom: 6px;
    font-size: 10px;
    font-weight: 650;
    color: #b9c0c9;
}

.field-label-row,
.section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 12px;
}

.section-heading {
    margin-bottom: 9px;
}

.section-heading label {
    margin-bottom: 2px;
}

.section-heading small {
    display: block;
    color: #798491;
    font-size: 9px;
}

.input,
.query {
    width: 100%;
    border: 1px solid #343d49;
    border-radius: 6px;
    outline: none;
    background: #0f1419;
    color: #e5e7eb;
}

.input {
    height: 35px;
    padding: 0 10px;
}

.query {
    min-height: 105px;
    resize: vertical;
    padding: 10px;
    font:
        11px/1.55 ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
}

.input:focus,
.query:focus {
    border-color: #4979b8;
    box-shadow: 0 0 0 2px rgba(73, 121, 184, 0.12);
}

.validation {
    margin-top: 6px;
    font-size: 9px;
}

.validation.valid {
    color: #62d68a;
}

.validation.invalid {
    color: #f87171;
}

.palette {
    display: grid;
    grid-template-columns: repeat(8, minmax(82px, 1fr));
    gap: 7px;
}

.swatch {
    height: 42px;
    padding: 0 8px;
    border: 2px solid transparent;
    border-radius: 6px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-weight: 650;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
}

.swatch:hover {
    transform: translateY(-1px);
}

.swatch.selected {
    border-color: #60a5fa;
    box-shadow:
        0 0 0 2px rgba(96, 165, 250, 0.22),
        inset 0 0 0 1px rgba(0, 0, 0, 0.16);
}

.swatch-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    opacity: 0.8;
}

.swatch span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.check {
    font-weight: 800;
}

.mini-preview {
    max-width: 270px;
    min-width: 190px;
    padding: 7px 10px;
    border-radius: 5px;
    color: #FFFFFF;
    font:
        9px ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
    white-space: nowrap;
}

.custom-color {
    margin-top: 10px;
    display: grid;
    grid-template-columns: auto minmax(160px, 280px) 34px;
    align-items: center;
    gap: 9px;
}

.custom-color label {
    margin: 0;
}

.mono {
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.native-picker {
    width: 34px;
    height: 34px;
    border: 1px solid #343d49;
    border-radius: 6px;
    padding: 2px;
    background: #1b2129;
}

.native-note {
    padding: 11px 12px;
    border: 1px solid #29483c;
    border-radius: 7px;
    background: #13201b;
}

.native-note strong {
    display: block;
    color: #8ae6b2;
    font-size: 10px;
    margin-bottom: 3px;
}

.native-note p {
    margin: 0;
    color: #8fa69a;
    font-size: 9px;
}

.editor-footer {
    flex: 0 0 51px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 0 14px;
    border-top: 1px solid #29303a;
    background: #171c22;
}

.editor-footer > span {
    color: #798491;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btn {
    height: 32px;
    padding: 0 11px;
    border-radius: 6px;
    border: 1px solid #39434f;
    background: #222831;
    color: #d3d7dd;
    font-size: 10px;
    font-weight: 650;
    cursor: pointer;
}

.btn:hover:not(:disabled) {
    background: #2a323c;
}

.btn:disabled {
    opacity: 0.55;
    cursor: default;
}

.btn.primary {
    background: #17663e;
    border-color: #25895a;
    color: #d8ffe7;
}

.btn.primary:hover:not(:disabled) {
    background: #1e7549;
}

.btn.subtle {
    height: 27px;
    color: #9ca5b1;
}

.btn.save {
    min-width: 85px;
}

.empty {
    padding: 25px 10px;
    color: #7f8995;
    text-align: center;
}

.empty-editor {
    display: grid;
    place-items: center;
    text-align: center;
    color: #89939f;
}

.empty-editor h2 {
    color: #d1d5db;
    font-size: 14px;
    margin: 7px 0 4px;
}

.empty-editor p {
    margin: 0 0 12px;
}

.empty-icon {
    font-size: 32px;
}

@media (max-width: 1250px) {
    .palette {
        grid-template-columns: repeat(6, minmax(82px, 1fr));
    }

    .workspace {
        grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    }
}

@media (max-width: 980px) {
    .palette {
        grid-template-columns: repeat(4, minmax(82px, 1fr));
    }

    .save-state {
        display: none;
    }

    .brand p {
        display: none;
    }
}
</style>
