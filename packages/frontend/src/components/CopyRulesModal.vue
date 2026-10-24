<script setup lang="ts">
import BaseButton from "./BaseButton.vue";
import { reactive } from "vue";
import type { useProjectSettings } from "../hooks/useProjectSettings";

const props = defineProps<{
    projectSettings: ReturnType<typeof useProjectSettings>;
}>();
const emit = defineEmits<{ copy: []; close: [] }>();
const projectSettings = reactive(props.projectSettings);
</script>

<template>
    <div
        class="hc-dialog hc-flex hc-w-[min(600px,calc(100vw-64px))] hc-flex-col hc-gap-5 hc-p-6"
    >
        <p
            class="hc-m-0 hc-text-[13px] hc-leading-normal hc-text-[var(--c-fg-subtle,#9199a5)]"
            v-if="projectSettings.copyLoading"
            role="status"
        >
            Loading projects…
        </p>
        <p
            class="hc-m-0 hc-text-[13px] hc-leading-normal hc-text-[var(--c-fg-subtle,#9199a5)]"
            v-else-if="projectSettings.copyError"
            role="alert"
        >
            {{ projectSettings.copyError }}
        </p>
        <template v-else-if="projectSettings.copyProjects.length">
            <label class="hc-flex hc-flex-col hc-gap-2"
                >Source project
                <select
                    v-model="projectSettings.copySourceProjectId"
                    class="hc-field-control hc-h-[35px] hc-px-2.5"
                >
                    <option
                        v-for="project in projectSettings.copyProjects"
                        :key="project.id"
                        :value="project.id"
                    >
                        {{ project.name }} — Groups: {{ project.groupCount }} ·
                        Rules: {{ project.ruleCount }}
                    </option>
                </select>
            </label>
            <p
                class="hc-m-0 hc-text-[13px] hc-leading-normal hc-text-[var(--c-fg-subtle,#9199a5)]"
            >
                Copy all rules and groups from this project. Copied rules start
                disabled. Filter presets must exist in the current project.
            </p>
        </template>
        <p
            class="hc-m-0 hc-text-[13px] hc-leading-normal hc-text-[var(--c-fg-subtle,#9199a5)]"
            v-else
        >
            No other project has rules yet.
        </p>
        <div
            class="hc-flex hc-justify-end hc-gap-2.5 hc-border-0 hc-border-t hc-border-solid hc-border-line hc-pt-4"
        >
            <BaseButton @click="emit('close')">Close</BaseButton>
            <BaseButton
                v-if="projectSettings.copyError"
                @click="projectSettings.loadCopyProjects"
            >
                Try again
            </BaseButton>
            <BaseButton
                v-else-if="
                    !projectSettings.copyLoading &&
                    projectSettings.copyProjects.length
                "
                variant="primary"
                :disabled="!projectSettings.copySourceProjectId"
                @click="
                    emit('copy');
                    emit('close');
                "
            >
                Copy all rules
            </BaseButton>
        </div>
    </div>
</template>
