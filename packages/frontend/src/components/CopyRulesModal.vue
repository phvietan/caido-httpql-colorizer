<script setup lang="ts">
import { reactive } from "vue";
import type { useColorizer } from "../useColorizer";

const props = defineProps<{ colorizer: ReturnType<typeof useColorizer> }>();
const emit = defineEmits<{ close: [] }>();
const colorizer = reactive(props.colorizer);
</script>

<template>
  <div class="copy-rules-modal">
    <p v-if="colorizer.copyLoading" role="status">Loading projects…</p>
    <p v-else-if="colorizer.copyError" role="alert">{{ colorizer.copyError }}</p>
    <template v-else-if="colorizer.copyProjects.length">
      <label class="copy-field">Source project
        <select v-model="colorizer.copySourceProjectId" class="input">
          <option v-for="project in colorizer.copyProjects" :key="project.id" :value="project.id">
            {{ project.name }} — Groups: {{ project.groupCount }} · Rules: {{ project.ruleCount }}
          </option>
        </select>
      </label>
      <p>Copy all rules and groups from this project. Copied rules start disabled. Filter presets must exist in the current project.</p>
    </template>
    <p v-else>No other project has rules yet.</p>
    <div class="copy-actions">
      <button class="btn" @click="emit('close')">Close</button>
      <button v-if="colorizer.copyError" class="btn" @click="colorizer.loadCopyProjects">Try again</button>
      <button v-else-if="!colorizer.copyLoading && colorizer.copyProjects.length" class="btn primary" :disabled="!colorizer.copySourceProjectId" @click="colorizer.copyRules(); emit('close')">Copy all rules</button>
    </div>
  </div>
</template>

