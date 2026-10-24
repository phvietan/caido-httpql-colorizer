import { computed, ref, watch } from "vue";
import type { ApplyResult, ApplyProgress, Settings } from "shared";
import { useSDK } from "../sdk";
import { prepareBackendSettings } from "../presets";
import type { useProjectSettings } from "./useProjectSettings";

const RECOLOR_REQUIRED =
  "Does not automatically recolorize; click Trigger colorizing.";

export function useRecolorize(projects: ReturnType<typeof useProjectSettings>) {
  const sdk = useSDK();
  const { settings, currentProjectId, snapshotSettings, queueStorageWrite } =
    projects;
  const revisionState = ref(0);
  const recoloringRuleNames = ref<string[]>([]);
  const statusText = ref("");
  const progress = ref<ApplyProgress>({
    active: false,
    current: 0,
    total: 0,
    phase: "idle",
  });
  const progressPercent = computed(() =>
    progress.value.total > 0
      ? Math.round((progress.value.current / progress.value.total) * 100)
      : 0,
  );
  async function updateProgress(revision: number) {
    try {
      const status = await sdk.backend.getBackendStatus();
      if (revision !== revisionState.value) return;
      const backendProgress = status.progress;
      Object.assign(progress.value, backendProgress);
      if (!backendProgress.active) return;
      const label =
        backendProgress.phase === "clearing"
          ? "Clearing existing colors"
          : backendProgress.phase === "finding"
            ? "Finding matching requests"
            : "Colorizing";
      statusText.value =
        backendProgress.phase === "finding"
          ? label
          : `${label} ${backendProgress.current} / ${backendProgress.total}`;
    } catch {
      // Progress polling is best effort; the main RPC result remains authoritative.
    }
  }

  function saveSettings() {
    const snapshot = snapshotSettings();
    const prepared = prepareBackendSettings(snapshot, sdk.filters.getAll());
    const revision = ++revisionState.value;
    recoloringRuleNames.value = [];
    progress.value = { ...progress.value, active: false, phase: "idle" };
    statusText.value = currentProjectId.value
      ? (prepared.errors[0] ?? RECOLOR_REQUIRED)
      : "No active Caido project.";
    const storageWrite = queueStorageWrite(snapshot);
    void Promise.all([
      storageWrite,
      sdk.backend.setSettings(prepared.backend, currentProjectId.value),
    ]).catch((error: unknown) => {
      if (revision !== revisionState.value) return;
      statusText.value = error instanceof Error ? error.message : String(error);
      sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
    });
  }

  function triggerColorizing() {
    if (!currentProjectId.value) return;
    const snapshot = snapshotSettings();
    const prepared = prepareBackendSettings(snapshot, sdk.filters.getAll());
    const revision = ++revisionState.value;
    const storageWrite = queueStorageWrite(snapshot);
    if (prepared.errors.length > 0) {
      recoloringRuleNames.value = [];
      progress.value = { active: false, current: 0, total: 0, phase: "idle" };
      statusText.value =
        prepared.errors[0] ?? "A referenced preset does not exist.";
      void Promise.all([
        storageWrite,
        sdk.backend.setSettings(prepared.backend, currentProjectId.value),
      ]).catch((error: unknown) => {
        if (revision !== revisionState.value) return;
        statusText.value =
          error instanceof Error ? error.message : String(error);
      });
      return;
    }
    progress.value = { active: true, current: 0, total: 0, phase: "finding" };
    recoloringRuleNames.value = snapshot.rules
      .filter((rule) => rule.enabled && rule.httpql.trim())
      .map((rule) => rule.name);
    statusText.value = "Re-evaluating HTTP History…";
    const progressPoller = setInterval(
      () => void updateProgress(revision),
      250,
    );
    void updateProgress(revision);
    void runColorizing(
      prepared.backend,
      currentProjectId.value,
      revision,
      storageWrite,
      progressPoller,
    );
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
      if (revision !== revisionState.value) return;
      const result: ApplyResult = await sdk.backend.recolorize(projectId);
      if (revision !== revisionState.value || result.cancelled) return;
      if (result.errors.length > 0) {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}. ${result.errors.length} error(s) — see Caido logs.`;
        for (const error of result.errors)
          sdk.log.error(`[HTTPQL Colorizer] ${error}`);
      } else {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}, removed color from ${result.cleared} row${result.cleared === 1 ? "" : "s"}.`;
      }
    } catch (error) {
      if (revision !== revisionState.value) return;
      statusText.value = error instanceof Error ? error.message : String(error);
      sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
    } finally {
      clearInterval(progressPoller);
      if (revision === revisionState.value) {
        recoloringRuleNames.value = [];
        progress.value = {
          ...progress.value,
          active: false,
          phase: "idle",
        };
      }
    }
  }

  watch(
    currentProjectId,
    () => {
      progress.value = { active: false, current: 0, total: 0, phase: "idle" };
      saveSettings();
    },
    { flush: "sync" },
  );
  return {
    revision: revisionState,
    recoloringRuleNames,
    statusText,
    progress,
    progressPercent,
    saveSettings,
    triggerColorizing,
  };
}
