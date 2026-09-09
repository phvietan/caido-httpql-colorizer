import { computed, onMounted, ref } from "vue";
import type { ApplyResult, ColorRule, Settings, ValidationResult } from "shared";
import { useSDK } from "./sdk";

export function useColorizer() {
  const sdk = useSDK();
  const settings = ref<Settings>({ enabled: true, rules: [] });
  const selectedId = ref<string | null>(null);
  const busy = ref(false);
  const saved = ref(false);
  const statusText = ref("Ready");
  const validation = ref<ValidationResult | null>(null);
  const progress = ref({ active: false, current: 0, total: 0, phase: "idle" as const });
  const progressPercent = computed(() => progress.value.total > 0
    ? Math.round((progress.value.current / progress.value.total) * 100)
    : 0);

  const selectedRule = computed(
    () => settings.value.rules.find((rule) => rule.id === selectedId.value) ?? null,
  );

  function uid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function newRule() {
    const rule: ColorRule = {
      id: uid(), name: `Rule ${settings.value.rules.length + 1}`,
      httpql: 'req.host.cont:"example.com"', color: "#185A6C", enabled: true,
    };
    settings.value.rules.push(rule);
    selectedId.value = rule.id;
    validation.value = null;
  }

  function removeRule() {
    const index = settings.value.rules.findIndex((rule) => rule.id === selectedId.value);
    if (index < 0) return;
    settings.value.rules.splice(index, 1);
    selectedId.value = settings.value.rules[Math.min(index, settings.value.rules.length - 1)]?.id ?? null;
    validation.value = null;
  }

  function move(delta: number) {
    const index = settings.value.rules.findIndex((rule) => rule.id === selectedId.value);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= settings.value.rules.length) return;
    const [item] = settings.value.rules.splice(index, 1);
    if (item) settings.value.rules.splice(next, 0, item);
  }

  async function validate() {
    if (!selectedRule.value) return;
    validation.value = await sdk.backend.validateHttpql(selectedRule.value.httpql);
  }

  function selectPreset(hex: string) {
    if (selectedRule.value) selectedRule.value.color = hex;
  }

  async function updateProgress() {
    try {
      const status = await sdk.backend.getBackendStatus();
      const backendProgress = status.progress;
      Object.assign(progress.value, backendProgress);
      if (!backendProgress.active) return;
      const label = backendProgress.phase === "clearing"
        ? "Clearing existing colors"
        : backendProgress.phase === "finding"
          ? "Finding matching requests"
          : "Applying colors";
      statusText.value = backendProgress.phase === "finding"
        ? label
        : `${label} ${backendProgress.current} / ${backendProgress.total}`;
    } catch {
      // Progress polling is best effort; the main RPC result remains authoritative.
    }
  }

  async function saveAndApply() {
    busy.value = true;
    saved.value = false;
    statusText.value = "Re-evaluating HTTP History…";
    const progressPoller = setInterval(() => void updateProgress(), 250);
    void updateProgress();
    try {
      await sdk.storage.set(settings.value);
      const result: ApplyResult = await sdk.backend.setSettings(settings.value);
      if (result.errors.length > 0) {
        statusText.value = `Colored ${result.colored}, cleared ${result.cleared}. ${result.errors.length} error(s) — see Caido logs.`;
        for (const error of result.errors) sdk.log.error(`[HTTPQL Colorizer] ${error}`);
      } else {
        statusText.value = `Colored ${result.colored} request${result.colored === 1 ? "" : "s"}.`;
      }
      saved.value = true;
      setTimeout(() => (saved.value = false), 1800);
    } catch (error) {
      statusText.value = error instanceof Error ? error.message : String(error);
      sdk.log.error(`[HTTPQL Colorizer] ${statusText.value}`);
    } finally {
      clearInterval(progressPoller);
      busy.value = false;
    }
  }

  function toggleGlobal() { return saveAndApply(); }

  async function load() {
    const stored = sdk.storage.get() as Settings | undefined;
    if (stored && Array.isArray(stored.rules)) {
      settings.value = { enabled: stored.enabled ?? true, rules: stored.rules };
    } else {
      newRule();
    }
    selectedId.value = settings.value.rules[0]?.id ?? null;
    await saveAndApply();
  }

  onMounted(load);
  return { settings, selectedId, busy, saved, statusText, validation, selectedRule,
    progress, progressPercent,
    newRule, removeRule, move, validate, selectPreset, saveAndApply, toggleGlobal };
}
