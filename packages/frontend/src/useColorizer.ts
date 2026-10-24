import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  ApplyResult,
  ApplyProgress,
  ColorRule,
  RuleGroup,
  Settings,
  ValidationResult,
} from "shared";
import { useSDK } from "./sdk";
import { Project, Setting } from "shared";
import type { StoredSettings } from "shared";
import { useRuleDrag } from "./useRuleDrag";
import { missingPresetErrors, prepareBackendSettings } from "./presets";

const RECOLOR_REQUIRED =
  "Does not automatically recolorize; click Trigger colorizing.";

export function useColorizer() {
  const sdk = useSDK();
  let applyRevision = 0;
  let storageWrites: Promise<void> = Promise.resolve();
  const project = ref<Project | null>(null);
  const empty = new Setting();
  const settings = computed(() => project.value?.setting ?? empty);
  const currentProjectId = computed(() => project.value?.id ?? null);
  const storedSettings = ref<StoredSettings>({ settingsByProject: {} });
  const projectNames = ref<Record<string, string>>({});
  const copySourceProjectId = ref("");
  const copyLoading = ref(false);
  const copyError = ref("");
  let projectListener: { stop(): void } | undefined;
  const selectedId = ref<string | null>(null);
  const recoloringRuleNames = ref<string[]>([]);
  const statusText = ref("");
  const validation = ref<ValidationResult | null>(null);
  const drag = useRuleDrag(settings, selectedId, saveSettings);
  const { finishRuleDrag, finishGroupDrag } = drag;
  const progress = ref<ApplyProgress>({ active: false, current: 0, total: 0, phase: "idle" });
  const progressPercent = computed(() => progress.value.total > 0
    ? Math.round((progress.value.current / progress.value.total) * 100)
    : 0);
  const copyProjects = computed(() => Object.entries(storedSettings.value.settingsByProject)
    .filter(([id, snapshot]) => id !== currentProjectId.value && projectNames.value[id] && snapshot.rules.length > 0)
    .map(([id, snapshot]) => ({
      id, name: projectNames.value[id]!,
      groupCount: snapshot.groups.length, ruleCount: snapshot.rules.length,
    })));

  const selectedRule = computed(
    () => settings.value.rules.find((rule) => rule.id === selectedId.value) ?? null,
  );
  const ruleSections = computed(() => [
    ...settings.value.groups.map((group) => ({
      id: group.id as string | null,
      name: group.name,
      group,
      rules: settings.value.rules.filter((rule) => rule.groupId === group.id),
    })),
    {
      id: null,
      name: settings.value.groups.length > 0 ? "Ungrouped" : "",
      group: null,
      rules: settings.value.rules.filter((rule) => !rule.groupId),
    },
  ]);

  function uid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function newRule() {
    if (!currentProjectId.value) return;
    const rule: ColorRule = {
      id: uid(), name: `Rule ${settings.value.rules.length + 1}`,
      httpql: 'req.host.cont:"example.com"', color: "#185A6C", enabled: true,
      groupId: null,
    };
    settings.value.rules.push(rule);
    selectedId.value = rule.id;
    validation.value = null;
    saveSettings();
  }

  function newGroup() {
    if (!currentProjectId.value) return;
    const group: RuleGroup = {
      id: uid(),
      name: `Group ${settings.value.groups.length + 1}`,
    };
    settings.value.groups.push(group);
    saveSettings();
  }


  function groupAllEnabled(groupId: string): boolean {
    const rules = settings.value.rules.filter((rule) => rule.groupId === groupId);
    return rules.length > 0 && rules.every((rule) => rule.enabled);
  }

  function toggleGroup(groupId: string) {
    const rules = settings.value.rules.filter((rule) => rule.groupId === groupId);
    const enable = !rules.every((rule) => rule.enabled);
    for (const rule of rules) rule.enabled = enable;
    saveSettings();
  }

  function removeRule(ruleId: string | null = selectedId.value) {
    const index = settings.value.removeRule(ruleId);
    if (index < 0) return;
    if (selectedId.value === ruleId) {
      selectedId.value = settings.value.rules[Math.min(index, settings.value.rules.length - 1)]?.id ?? null;
      validation.value = null;
    }
    finishRuleDrag();
    saveSettings();
  }

  function removeGroup(groupId: string) {
    if (!settings.value.removeGroup(groupId)) return;
    if (!settings.value.rules.some((rule) => rule.id === selectedId.value)) {
      selectedId.value = settings.value.rules[0]?.id ?? null;
      validation.value = null;
    }
    finishRuleDrag();
    finishGroupDrag();
    saveSettings();
  }


  async function validate() {
    if (!selectedRule.value) return;
    const revision = applyRevision;
    const ruleId = selectedRule.value.id;
    const presetErrors = missingPresetErrors([selectedRule.value], sdk.filters.getAll());
    if (presetErrors.length > 0) {
      validation.value = { ok: false, error: presetErrors[0] ?? "Preset does not exist." };
      return;
    }
    const result = await sdk.backend.validateHttpql(selectedRule.value.httpql);
    if (revision === applyRevision && selectedId.value === ruleId) validation.value = result;
  }

  function selectPreset(hex: string) {
    if (selectedRule.value) selectedRule.value.color = hex;
  }

  async function updateProgress(revision: number) {
    try {
      const status = await sdk.backend.getBackendStatus();
      if (revision !== applyRevision) return;
      const backendProgress = status.progress;
      Object.assign(progress.value, backendProgress);
      if (!backendProgress.active) return;
      const label = backendProgress.phase === "clearing"
        ? "Clearing existing colors"
        : backendProgress.phase === "finding"
          ? "Finding matching requests"
          : "Colorizing";
      statusText.value = backendProgress.phase === "finding"
        ? label
        : `${label} ${backendProgress.current} / ${backendProgress.total}`;
    } catch {
      // Progress polling is best effort; the main RPC result remains authoritative.
    }
  }

  function snapshotSettings(): Settings {
    settings.value.orderRules();
    return { ...settings.value.toJSON(), enabled: true };
  }

  async function loadCopyProjects() {
    copyLoading.value = false;
    copyError.value = "";
    copySourceProjectId.value = "";
    const projectId = currentProjectId.value;
    if (!Object.entries(storedSettings.value.settingsByProject)
      .some(([id, snapshot]) => id !== projectId && snapshot.rules.length > 0)) return;
    copyLoading.value = true;
    try {
      const projects = await sdk.backend.getProjects();
      if (projectId !== currentProjectId.value) return;
      projectNames.value = Object.fromEntries(projects.map((project) => [project.id, project.name]));
      copySourceProjectId.value = copyProjects.value[0]?.id ?? "";
    } catch (error) {
      copyError.value = "Could not load project names. Please try again.";
      sdk.log.error(`[HTTPQL Colorizer] Could not load project names: ${String(error)}`);
    } finally {
      copyLoading.value = false;
    }
  }

  function copyRules() {
    if (!currentProjectId.value || copySourceProjectId.value === currentProjectId.value) return;
    const source = storedSettings.value.settingsByProject[copySourceProjectId.value];
    if (!source) return;
    if (!project.value) return;
    const copied = project.value.copyRulesFrom(new Project(copySourceProjectId.value, source), uid);
    selectedId.value = copied.rules[0]?.id ?? selectedId.value;
    validation.value = null;
    saveSettings();
    sdk.window.showToast(`Copied ${copied.rules.length} rules from "${projectNames.value[copySourceProjectId.value]}". Copied rules start disabled.`, { variant: "success" });
  }


  function queueStorageWrite(snapshot: Settings): Promise<void> {
    if (currentProjectId.value) {
      storedSettings.value.settingsByProject[currentProjectId.value] = snapshot;
    }
    const stored = JSON.parse(JSON.stringify(storedSettings.value)) as StoredSettings;
    const write = storageWrites.then(() => sdk.storage.set(stored));
    storageWrites = write.catch(() => undefined);
    return write;
  }

  function saveSettings() {
    const snapshot = snapshotSettings();
    const prepared = prepareBackendSettings(snapshot, sdk.filters.getAll());
    const revision = ++applyRevision;
    recoloringRuleNames.value = [];
    progress.value = { ...progress.value, active: false, phase: "idle" };
    statusText.value = currentProjectId.value ? prepared.errors[0] ?? RECOLOR_REQUIRED : "No active Caido project.";
    const storageWrite = queueStorageWrite(snapshot);
    void Promise.all([storageWrite, sdk.backend.setSettings(prepared.backend, currentProjectId.value)]).catch(
      (error: unknown) => {
        if (revision !== applyRevision) return;
        statusText.value = error instanceof Error ? error.message : String(error);
        sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
      },
    );
  }

  function triggerColorizing() {
    if (!currentProjectId.value) return;
    const snapshot = snapshotSettings();
    const prepared = prepareBackendSettings(snapshot, sdk.filters.getAll());
    const revision = ++applyRevision;
    const storageWrite = queueStorageWrite(snapshot);
    if (prepared.errors.length > 0) {
      recoloringRuleNames.value = [];
      progress.value = { active: false, current: 0, total: 0, phase: "idle" };
      statusText.value = prepared.errors[0] ?? "A referenced preset does not exist.";
      void Promise.all([
        storageWrite,
        sdk.backend.setSettings(prepared.backend, currentProjectId.value),
      ]).catch((error: unknown) => {
        if (revision !== applyRevision) return;
        statusText.value = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    progress.value = { active: true, current: 0, total: 0, phase: "finding" };
    recoloringRuleNames.value = snapshot.enabled
      ? snapshot.rules
          .filter((rule) => rule.enabled && rule.httpql.trim())
          .map((rule) => rule.name)
      : [];
    statusText.value = "Re-evaluating HTTP History…";
    const progressPoller = setInterval(() => void updateProgress(revision), 250);
    void updateProgress(revision);
    void runColorizing(prepared.backend, currentProjectId.value, revision, storageWrite, progressPoller);
  }

  async function runColorizing(
    snapshot: Settings,
    projectId: string,
    revision: number,
    storageWrite: Promise<void>,
    progressPoller: ReturnType<typeof setInterval>,
  ) {
    try {
      await Promise.all([
        storageWrite,
        sdk.backend.setSettings(snapshot, projectId),
      ]);
      if (revision !== applyRevision) return;
      const result: ApplyResult = await sdk.backend.recolorize(projectId);
      if (revision !== applyRevision || result.cancelled) return;
      if (result.errors.length > 0) {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}. ${result.errors.length} error(s) — see Caido logs.`;
        for (const error of result.errors) sdk.log.error(`[HTTPQL Colorizer] ${error}`);
      } else {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}.`;
      }
    } catch (error) {
      if (revision !== applyRevision) return;
      statusText.value = error instanceof Error ? error.message : String(error);
      sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
    } finally {
      clearInterval(progressPoller);
      if (revision === applyRevision) {
        recoloringRuleNames.value = [];
        progress.value = {
          ...progress.value,
          active: false,
          phase: "idle",
        };
      }
    }
  }

  function handleProjectChange(projectId: string | undefined) {
    if ((projectId ?? null) === currentProjectId.value) return;
    const storageWrite = queueStorageWrite(snapshotSettings());
    void storageWrite.catch((error: unknown) => sdk.log.error(`[HTTPQL Colorizer] Failed to save project settings: ${String(error)}`));
    project.value = projectId ? new Project(projectId, storedSettings.value.settingsByProject[projectId]) : null;
    selectedId.value = settings.value.rules[0]?.id ?? null;
    validation.value = null;
    finishRuleDrag();
    finishGroupDrag();
    copySourceProjectId.value = "";
    applyRevision += 1;
    recoloringRuleNames.value = [];
    progress.value = { active: false, current: 0, total: 0, phase: "idle" };
    statusText.value = projectId ? RECOLOR_REQUIRED : "No active Caido project.";
    saveSettings();
  }

  async function load() {
    let projectChanged = false;
    projectListener = sdk.projects.onCurrentProjectChange((event) => {
      projectChanged = true;
      handleProjectChange(event.projectId);
    });
    const stored = sdk.storage.get() as StoredSettings | undefined;
    storedSettings.value = { settingsByProject: stored?.settingsByProject ?? {} };
    const backendStatus = await sdk.backend.getBackendStatus();
    if (!projectChanged) handleProjectChange(backendStatus.projectId ?? undefined);
  }

  onMounted(() => void load());
  onBeforeUnmount(() => projectListener?.stop());
  return {
    ...drag, settings, selectedId, recoloringRuleNames, statusText, validation,
    selectedRule, ruleSections, progress, progressPercent, newRule, newGroup,
    removeRule, removeGroup, groupAllEnabled, toggleGroup, validate, selectPreset, saveSettings,
    triggerColorizing, currentProjectId, copyProjects, copyLoading, copyError,
    copySourceProjectId, loadCopyProjects, copyRules,
  };
}
