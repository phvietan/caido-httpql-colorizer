import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Project, Setting } from "shared";
import type { Settings, StoredSettings } from "shared";
import { useSDK } from "../sdk";

export function useProjectSettings() {
  const sdk = useSDK();
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
  let copyLoadRevision = 0;
  let projectListener: { stop(): void } | undefined;
  const copyProjects = computed(() =>
    Object.entries(storedSettings.value.settingsByProject)
      .filter(
        ([id, snapshot]) =>
          id !== currentProjectId.value &&
          projectNames.value[id] &&
          snapshot.rules.length > 0,
      )
      .map(([id, snapshot]) => ({
        id,
        name: projectNames.value[id]!,
        groupCount: snapshot.groups.length,
        ruleCount: snapshot.rules.length,
      })),
  );

  function snapshotSettings(): Settings {
    settings.value.orderRules();
    return { ...settings.value.toJSON(), enabled: true };
  }

  async function loadCopyProjects() {
    const revision = ++copyLoadRevision;
    copyLoading.value = false;
    copyError.value = "";
    copySourceProjectId.value = "";
    const projectId = currentProjectId.value;
    if (
      !Object.entries(storedSettings.value.settingsByProject).some(
        ([id, snapshot]) => id !== projectId && snapshot.rules.length > 0,
      )
    )
      return;
    copyLoading.value = true;
    try {
      const projects = await sdk.backend.getProjects();
      if (revision !== copyLoadRevision) return;
      projectNames.value = Object.fromEntries(
        projects.map((project) => [project.id, project.name]),
      );
      copySourceProjectId.value = copyProjects.value[0]?.id ?? "";
    } catch (error) {
      if (revision !== copyLoadRevision) return;
      copyError.value = "Could not load project names. Please try again.";
      sdk.log.error(
        `[HTTPQL Colorizer] Could not load project names: ${String(error)}`,
      );
    } finally {
      if (revision === copyLoadRevision) copyLoading.value = false;
    }
  }

  function copyRules() {
    if (
      !currentProjectId.value ||
      copySourceProjectId.value === currentProjectId.value
    )
      return;
    const source =
      storedSettings.value.settingsByProject[copySourceProjectId.value];
    if (!source) return;
    if (!project.value) return;
    const copied = project.value.copyRulesFrom(
      new Project(copySourceProjectId.value, source),
      () => crypto.randomUUID(),
    );
    sdk.window.showToast(
      `Copied ${copied.rules.length} rules from "${projectNames.value[copySourceProjectId.value]}". Copied rules start disabled.`,
      { variant: "success" },
    );
    return copied;
  }

  function queueStorageWrite(snapshot: Settings): Promise<void> {
    if (currentProjectId.value) {
      storedSettings.value.settingsByProject[currentProjectId.value] = snapshot;
    }
    const stored = JSON.parse(
      JSON.stringify(storedSettings.value),
    ) as StoredSettings;
    const write = storageWrites.then(() => sdk.storage.set(stored));
    storageWrites = write.catch(() => undefined);
    return write;
  }

  function handleProjectChange(projectId: string | undefined) {
    if ((projectId ?? null) === currentProjectId.value) return;
    copyLoadRevision += 1;
    copyLoading.value = false;
    copyError.value = "";
    const storageWrite = queueStorageWrite(snapshotSettings());
    void storageWrite.catch((error: unknown) =>
      sdk.log.error(
        `[HTTPQL Colorizer] Failed to save project settings: ${String(error)}`,
      ),
    );
    // Subsequent settings/rescan calls carry this ID; the backend rejects rescans if Caido has moved on.
    project.value = projectId
      ? new Project(
          projectId,
          storedSettings.value.settingsByProject[projectId],
        )
      : null;
    copySourceProjectId.value = "";
  }

  async function load() {
    let projectChanged = false;
    projectListener = sdk.projects.onCurrentProjectChange((event) => {
      projectChanged = true;
      handleProjectChange(event.projectId);
    });
    const stored = sdk.storage.get() as StoredSettings | undefined;
    storedSettings.value = {
      settingsByProject: stored?.settingsByProject ?? {},
    };
    const backendStatus = await sdk.backend.getBackendStatus();
    if (!projectChanged)
      handleProjectChange(backendStatus.projectId ?? undefined);
  }

  onMounted(() => void load());
  onBeforeUnmount(() => projectListener?.stop());
  return {
    settings,
    currentProjectId,
    snapshotSettings,
    queueStorageWrite,
    copyProjects,
    copyLoading,
    copyError,
    copySourceProjectId,
    loadCopyProjects,
    copyRules,
  };
}
