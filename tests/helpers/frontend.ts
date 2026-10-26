import * as Vue from "vue";
import { afterEach, vi } from "vitest";
import type { Caido } from "@caido/sdk-frontend";
import type { API, Settings, StoredSettings, ValidationResult } from "shared";
import { useProjectSettings } from "../../packages/frontend/src/hooks/useProjectSettings";
import { useRecolorize } from "../../packages/frontend/src/hooks/useRecolorize";
import { useRules } from "../../packages/frontend/src/hooks/useRules";
import { setSDK } from "../../packages/frontend/src/sdk";
import { plain } from "./fixtures";

// Hooks need a Vue lifecycle, but their test root renders only a comment.
const renderer = Vue.createRenderer({
  createComment: () => ({}), createElement: () => ({}), createText: () => ({}),
  insert() {}, remove() {}, patchProp() {}, setText() {}, setElementText() {},
  parentNode: () => null, nextSibling: () => null,
});
const unmounts: Array<() => void> = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  vi.useRealTimers();
});

export function mount(stored: StoredSettings, projectId = "A", statusPromise?: Promise<{ projectId: string | null }>) {
  let listener: (event: { projectId?: string }) => void;
  const writes: StoredSettings[] = [],
    backendWrites: Array<{ settings: Settings; id: string | null }> = [];
  const sdk = {
    storage: {
      get: () => plain(stored),
      set: async (value: StoredSettings) => {
        writes.push(plain(value));
      },
    },
    backend: {
      getBackendStatus: () => statusPromise ?? Promise.resolve({ projectId }),
      setSettings: async (settings: Settings, id: string | null) => {
        backendWrites.push({ settings: plain(settings), id });
      },
      getProjects: async () => [{ id: "A", name: "Project A" }],
      validateHttpql: async (_query: string): Promise<ValidationResult> => ({ ok: true }),
    },
    filters: { getAll: () => [] },
    projects: {
      onCurrentProjectChange: (callback: typeof listener) => {
        listener = callback;
        return { stop() {} };
      },
    },
    graphql: {
      projects: async () => ({ projects: [{ id: "A", name: "Project A" }] }),
    },
    log: { error() {} },
    window: { showToast() {} },
  };
  function setup() {
    const projects = useProjectSettings();
    const colorizing = useRecolorize(projects);
    const rules = useRules(projects, colorizing);
    return { ...projects, ...colorizing, ...rules, ...rules.drag };
  }
  let app!: ReturnType<typeof setup>;
  setSDK(sdk as unknown as Caido<API>);
  const instance = renderer.createApp({
    setup() { app = setup(); return () => null; },
  });
  instance.mount({});
  const unmount = () => instance.unmount();
  unmounts.push(unmount);
  return {
    app,
    sdk,
    writes,
    backendWrites,
    unmount,
    change: (id?: string) => listener({ projectId: id }),
  };
}
