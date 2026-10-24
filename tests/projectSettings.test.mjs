import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { transformWithEsbuild } from "vite";
import * as Vue from "vue";
import { parse, compileScript } from "vue/compiler-sfc";
import { renderToString } from "vue/server-renderer";

async function compile(path, format = "esm") {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  return (await transformWithEsbuild(source, path, { format })).code;
}
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const helpersUrl = moduleUrl(await compile("../packages/shared/src/helpers.ts"));
const sharedHelpers = await import(helpersUrl);
const settingUrl = moduleUrl((await compile("../packages/shared/src/Setting.ts")).replace('"./helpers"', JSON.stringify(helpersUrl)));
const { Setting } = await import(settingUrl);
const { Project } = await import(moduleUrl((await compile("../packages/shared/src/Project.ts")).replace('"./Setting"', JSON.stringify(settingUrl))));
const { mapWithConcurrency } = await import(moduleUrl(await compile("../packages/shared/src/concurrency.ts")));
const shared = { Project, Setting, mapWithConcurrency, ...sharedHelpers };
const projectsCode = await compile("../packages/frontend/src/hooks/useProjectSettings.ts", "cjs");
const recolorizeCode = await compile("../packages/frontend/src/hooks/useRecolorize.ts", "cjs");
const rulesCode = await compile("../packages/frontend/src/hooks/useRules.ts", "cjs");
const dialogsCode = await compile("../packages/frontend/src/dialogs.ts", "cjs");
const dragCode = await compile("../packages/frontend/src/hooks/useRuleDrag.ts", "cjs");
const presets = await import(moduleUrl(await compile("../packages/frontend/src/presets.ts")));
const backend = await compile("../packages/backend/src/rpc.ts", "cjs");
const metadataCode = await compile("../packages/backend/src/metadata.ts", "cjs");
const historyCode = await compile("../packages/backend/src/history.ts", "cjs");
const databaseCode = await compile("../packages/backend/src/db.ts", "cjs");
const startupCode = await compile("../packages/backend/src/index.ts", "cjs");

function evaluate(code, imports) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout, clearTimeout, setInterval, clearInterval, crypto: webcrypto,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

async function loadComponent(name) {
  const source = readFileSync(new URL("../packages/frontend/src/components/" + name, import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: name, inlineTemplate: true });
  const { code } = await transformWithEsbuild(script.content, name + ".ts", { format: "cjs" });
  return evaluate(code, { vue: Vue }).default;
}
const BaseButton = await loadComponent("BaseButton.vue");
const componentImports = { vue: Vue, "./BaseButton.vue": { default: BaseButton, __esModule: true } };

function loadBackend(db = {}) {
  const metadata = evaluate(metadataCode, { shared });
  const history = evaluate(historyCode, { shared, "./metadata": metadata, "./db": db });
  return evaluate(backend, { shared, "./metadata": metadata, "./history": history, "./db": db }).RPC;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
const scopes = [];
test.afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); });
const original = {
  enabled: true,
  groups: [{ id: "g", name: "API" }],
  rules: [
    { id: "r1", name: "Errors", httpql: 'preset:"API" AND resp.code.gte:400', color: "#185A6C", enabled: true, groupId: "g" },
    { id: "r2", name: "Other", httpql: "resp.code.eq:200", color: "#abcdef", enabled: false, groupId: null },
  ],
};

test("hex normalization trims, uppercases, and defaults invalid colors", () => {
  assert.equal(sharedHelpers.normalizeHex(" #a1b2c3 "), "#A1B2C3");
  assert.equal(sharedHelpers.normalizeHex("red"), "#185A6C");
  assert.equal(sharedHelpers.normalizeHex("#abc"), "#185A6C");
});

test("shared color comparison preserves case-insensitive matching and empty-color clearing", () => {
  assert.equal(sharedHelpers.colorsEqual("#aabbcc", "#AABBCC"), true);
  assert.equal(sharedHelpers.colorsEqual("#aabbcc", "#112233"), false);
  assert.equal(sharedHelpers.colorsEqual(null, ""), true);
  assert.equal(sharedHelpers.colorsEqual(null, "#185A6C"), false);
});

test("shared cancellation results preserve counts and cap errors", () => {
  const errors = Array.from({ length: 25 }, (_, index) => `Error ${index}`);
  const result = sharedHelpers.cancelledResult(3, errors, 7);
  assert.equal(result.cancelled, true);
  assert.equal(result.cleared, 3);
  assert.equal(result.colored, 7);
  assert.equal(result.errors.length, 20);
  assert.equal(errors.length, 25);
});

test("backend startup initializes the table before handlers and CRUD never repeats initialization", async () => {
  const db = evaluate(databaseCode, {});
  const rpc = loadBackend(db);
  const { init } = evaluate(startupCode, { shared, "./db": db, "./rpc": { RPC: rpc } });
  const order = [];
  const sdk = {
    meta: { db: async () => ({
      exec: async () => { order.push("initialize"); },
      prepare: async () => ({ run: async () => {}, all: async () => [{ request_id: "r1" }] }),
    }) },
    api: { register: () => { order.push("register"); } },
    projects: { getCurrent: async () => undefined },
    events: { onProjectChange() {}, onInterceptResponse() {} },
    console: { log() {} },
  };
  await init(sdk);
  assert.equal(order[0], "initialize");
  await db.rememberColoredRequests(sdk, "A", ["r1"]);
  await db.rememberColoredRequests(sdk, "A", ["r2", "r3"]);
  assert.deepEqual(plain(await db.ownedRequestIds(sdk, "A")), ["r1"]);
  await db.forgetColoredRequests(sdk, "A", ["r1"]);
  assert.equal(order.filter((item) => item === "initialize").length, 1);
  order.length = 0;
  sdk.meta.db = async () => { throw new Error("Database unavailable"); };
  await assert.rejects(init(sdk), /Database unavailable/);
  assert.equal(order.length, 0);
});

test("API registration normalizes settings into a Project before calling the RPC handler", async () => {
  const rpc = loadBackend();
  const { init } = evaluate(startupCode, {
    shared, "./db": { ensureDatabase: async () => {} }, "./rpc": { RPC: rpc },
  });
  const handlers = {};
  let received;
  const setSettings = rpc.setSettings;
  rpc.setSettings = (project) => { received = project; setSettings(project); };
  const sdk = {
    api: { register: (name, handler) => { handlers[name] = handler; } },
    projects: { getCurrent: async () => ({ getId: () => "A" }) },
    events: { onProjectChange() {}, onInterceptResponse() {} }, console: { log() {} },
  };
  await init(sdk);
  const input = plain(original);
  input.rules[0].color = " #aabbcc ";
  input.rules[0].httpql = ' req.host.eq:"example.com" ';
  handlers.setSettings(sdk, input, "A");
  assert.ok(received instanceof Project);
  assert.ok(received.setting instanceof Setting);
  assert.equal(received.setting.rules[0].color, "#AABBCC");
  assert.equal(received.setting.rules[0].httpql, 'req.host.eq:"example.com"');
  assert.equal((await handlers.getBackendStatus(sdk)).ruleCount, 2);
  received = undefined;
  handlers.setSettings(sdk, input, null);
  assert.equal(received, undefined);
  assert.equal(input.rules[0].color, " #aabbcc ");
});

test("settings serialize as plain data and project instances own independent settings", () => {
  const a = new Project("A", original);
  const b = new Project("B", original);
  assert.deepEqual(a.setting.toJSON(), original);
  a.setting.groups[0].name = "Changed";
  assert.equal(b.setting.groups[0].name, "API");
  assert.equal(original.groups[0].name, "API");
  const snapshot = a.setting.toJSON();
  snapshot.rules[0].name = "Changed snapshot";
  assert.equal(a.setting.rules[0].name, "Errors");
  assert.deepEqual(new Setting().toJSON(), { enabled: true, groups: [], rules: [] });
  assert.equal(new Setting({ ...original, groups: [] }).rules[0].groupId, null);
});

test("Setting normalizes backend input while leaving frontend editing values untouched", () => {
  const raw = {
    enabled: 1, groups: [{ id: 7, name: undefined }],
    rules: [{ id: 1, name: undefined, httpql: " req.host.eq:\"example.com\" ", color: " #aabbcc ", enabled: 1, groupId: 7 }],
  };
  const normalized = Setting.normalize(raw);
  assert.equal(normalized.groups[0].id, "7");
  assert.equal(normalized.rules[0].groupId, "7");
  assert.equal(normalized.rules[0].httpql, 'req.host.eq:"example.com"');
  assert.equal(normalized.rules[0].color, "#AABBCC");
  assert.equal(normalized.rules[0].enabled, true);
  assert.equal(raw.rules[0].color, " #aabbcc ");
  assert.deepEqual(Setting.normalize({}).toJSON(), { enabled: false, groups: [], rules: [] });
});

test("extracted preset handling expands known presets and disables missing references", () => {
  const known = presets.prepareBackendSettings(original, [{ alias: "api", name: "API", query: 'req.host.eq:"example.com"' }]);
  assert.equal(known.backend.rules[0].httpql, '(req.host.eq:"example.com") AND resp.code.gte:400');
  assert.equal(known.errors.length, 0);
  const missing = presets.prepareBackendSettings(original, []);
  assert.equal(missing.backend.rules[0].enabled, false);
  assert.equal(missing.errors.length, 1);
  assert.equal(original.rules[0].enabled, true);
});

test("copies all groups and rules with fresh IDs while preserving ungrouped rules and source data", () => {
  let counter = 0;
  const uid = () => `copy-${++counter}`;
  const source = plain(original);
  source.groups.push({ id: "g2", name: "Second group" }, { id: "empty", name: "Empty group" });
  source.rules.push({ ...source.rules[0], id: "r3", groupId: "g2" });
  const copied = new Setting(source).copyRules(uid);
  assert.equal(copied.groups.length, 3);
  assert.equal(copied.rules[2].groupId, copied.groups[1].id);
  assert.equal(new Set([...copied.groups, ...copied.rules].map((item) => item.id)).size, 6);
  assert.equal(copied.groups[0].name, "API");
  assert.equal(copied.rules[0].groupId, copied.groups[0].id);
  assert.equal(copied.rules[0].httpql, original.rules[0].httpql);
  assert.equal(copied.rules[0].enabled, false);
  assert.notEqual(copied.rules[0].id, original.rules[0].id);
  copied.rules[0].name = "Changed";
  assert.equal(original.rules[0].name, "Errors");
  assert.equal(copied.rules.length, 3);
  assert.equal(copied.rules[1].groupId, null);
  assert.ok(copied.rules.every((rule) => !rule.enabled));
  assert.equal(new Setting({ ...original, rules: [] }).copyRules(uid).groups.length, 1);
  assert.equal(new Setting({ ...original, groups: [] }).copyRules(uid).rules.length, 2);
});

function mount(stored, projectId = "A", statusPromise) {
  let mounted, listener;
  const writes = [], backendWrites = [];
  const sdk = {
    storage: { get: () => plain(stored), set: async (value) => { writes.push(plain(value)); } },
    backend: {
      getBackendStatus: () => statusPromise ?? Promise.resolve({ projectId }),
      setSettings: async (settings, id) => { backendWrites.push({ settings: plain(settings), id }); },
      getProjects: async () => [{ id: "A", name: "Project A" }],
      validateHttpql: async () => ({ ok: true }),
    },
    filters: { getAll: () => [] },
    projects: { onCurrentProjectChange: (callback) => { listener = callback; return { stop() {} }; } },
    graphql: { projects: async () => ({ projects: [{ id: "A", name: "Project A" }] }) },
    log: { error() {} }, window: { showToast() {} },
  };
  const vue = {
    ...Vue,
    onMounted: (fn) => { mounted = fn; }, onBeforeUnmount() {},
  };
  const drag = evaluate(dragCode, { vue });
  const imports = { vue, shared, "../sdk": { useSDK: () => sdk }, "../presets": presets, "./useRuleDrag": drag };
  const scope = Vue.effectScope();
  scopes.push(scope);
  const app = scope.run(() => {
    const projects = evaluate(projectsCode, imports).useProjectSettings();
    const colorizing = evaluate(recolorizeCode, imports).useRecolorize(projects);
    const rules = evaluate(rulesCode, imports).useRules(projects, colorizing);
    return { ...projects, ...colorizing, ...rules, ...rules.drag };
  });
  mounted();
  return { app, sdk, writes, backendWrites, unmount: () => scope.stop(), change: (id) => listener({ projectId: id }) };
}

test("switching projects saves edits, starts new projects empty, and restores previous rules", async () => {
  const { app, writes, backendWrites, change } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  app.settings.value.rules[0].name = "Unsaved edit";
  change("B");
  assert.equal(app.settings.value.rules.length, 0);
  assert.equal(app.settings.value.groups.length, 0);
  assert.equal(app.selectedId.value, null);
  app.newGroup();
  app.newRule();
  app.settings.value.rules[0].name = "Only B";
  change("A");
  assert.equal(app.settings.value.rules[0].name, "Unsaved edit");
  change("B");
  assert.equal(app.settings.value.rules[0].name, "Only B");
  await flush();
  assert.equal(writes.at(-1).settingsByProject.A.rules[0].name, "Unsaved edit");
  assert.equal(writes.at(-1).settingsByProject.B.rules[0].name, "Only B");
  assert.equal(backendWrites.at(-1).id, "B");
  const reloaded = mount(writes.at(-1), "A");
  await flush();
  assert.equal(reloaded.app.settings.value.rules[0].name, "Unsaved edit");
});

test("extracted drag handlers move an ungrouped rule into a group and save its order", async () => {
  const { app, writes } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  app.startRuleDrag("r2", {});
  app.handleSectionDrop("g");
  assert.equal(app.settings.value.rules[1].groupId, "g");
  assert.equal(app.draggedRuleId.value, null);
  await flush();
  assert.equal(writes.at(-1).settingsByProject.A.rules[1].groupId, "g");
});

test("copying appends every rule to the destination and does not change the source project", async () => {
  const { app, writes } = mount({ settingsByProject: { A: plain(original) } }, "B");
  await flush();
  app.newRule();
  const existingRuleId = app.settings.value.rules[0].id;
  await app.loadCopyProjects();
  assert.equal(app.copyProjects.value[0].name, "Project A");
  assert.equal(app.copyProjects.value[0].groupCount, 1);
  assert.equal(app.copyProjects.value[0].ruleCount, 2);
  app.copyRules();
  assert.equal(app.settings.value.groups[0].name, "API");
  assert.equal(app.settings.value.rules[0].enabled, false);
  await flush();
  assert.deepEqual(writes.at(-1).settingsByProject.A, original);
  assert.equal(writes.at(-1).settingsByProject.B.rules.length, 3);
  assert.ok(writes.at(-1).settingsByProject.B.rules.some((rule) => rule.id === existingRuleId));
  assert.equal(writes.at(-1).settingsByProject.B.rules[2].groupId, null);
});

test("project-name lookup uses the backend, never exposes UUIDs, and reports lookup failures", async () => {
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } }, "B");
  await flush();
  assert.equal(app.copyProjects.value.length, 0);
  sdk.graphql.projects = () => { throw new Error("Frontend GraphQL unavailable"); };
  await app.loadCopyProjects();
  assert.equal(app.copyProjects.value[0].name, "Project A");
  sdk.backend.getProjects = async () => { throw new Error("Connection failed"); };
  await app.loadCopyProjects();
  assert.match(app.copyError.value, /Could not load project names/);
  assert.equal(app.copyLoading.value, false);
  assert.equal(app.copySourceProjectId.value, "");
});

test("no other project with rules skips the backend lookup and immediately leaves loading", async () => {
  const { app, sdk } = mount({ settingsByProject: {
    A: plain(original), B: { enabled: true, groups: [{ id: "empty", name: "Empty" }], rules: [] },
  } });
  await flush();
  sdk.backend.getProjects = () => { throw new Error("Must not fetch names when no other project has rules"); };
  await app.loadCopyProjects();
  assert.equal(app.copyLoading.value, false);
  assert.equal(app.copyError.value, "");
  assert.equal(app.copyProjects.value.length, 0);
  assert.equal(app.copySourceProjectId.value, "");
});

test("project switches invalidate pending copy lookups without overwriting a newer lookup", async () => {
  const { app, sdk, change } = mount({ settingsByProject: { A: plain(original) } }, "B");
  await flush();
  let rejectOld, resolveNew;
  sdk.backend.getProjects = () => new Promise((_resolve, reject) => { rejectOld = reject; });
  const oldLookup = app.loadCopyProjects();
  assert.equal(app.copyLoading.value, true);
  change("C");
  assert.equal(app.copyLoading.value, false);
  sdk.backend.getProjects = () => new Promise((resolve) => { resolveNew = resolve; });
  const newLookup = app.loadCopyProjects();
  rejectOld(new Error("Old project disconnected"));
  await oldLookup;
  assert.equal(app.copyError.value, "");
  assert.equal(app.copyLoading.value, true);
  resolveNew([{ id: "A", name: "Project A" }]);
  await newLookup;
  assert.equal(app.copyLoading.value, false);
  assert.equal(app.copyProjects.value[0].name, "Project A");
});

test("SDK dialogs render buttons and loading updates with a separate host Vue runtime", async () => {
  const HostVue = vm.runInNewContext(readFileSync(new URL("../node_modules/vue/dist/vue.global.prod.js", import.meta.url), "utf8") + ";Vue", { console });
  const node = (type, text = "") => ({ type, text, children: [], parent: null, props: {} });
  const remove = (child) => {
    const siblings = child.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(child), 1);
    child.parent = null;
  };
  const host = {
    insert(child, parent, anchor) {
      remove(child);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
      child.parent = parent;
    },
    remove,
    createElement: (type) => node(type),
    createText: (text) => node("#text", text),
    createComment: (text) => node("#comment", text),
    setText: (element, text) => { element.text = text; },
    setElementText: (element, text) => { element.text = text; element.children = []; },
    parentNode: (element) => element.parent,
    nextSibling: (element) => element.parent?.children[element.parent.children.indexOf(element) + 1],
    patchProp: (element, key, _previous, value) => { element.props[key] = value; },
  };
  const local = Vue.createRenderer(host);
  const external = HostVue.createRenderer(host);
  const root = node("root");
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } }, "B");
  await flush();
  let resolve;
  sdk.backend.getProjects = () => new Promise((done) => { resolve = done; });
  const lookup = app.loadCopyProjects();
  const source = readFileSync(new URL("../packages/frontend/src/components/CopyRulesModal.vue", import.meta.url), "utf8");
  const script = compileScript(parse(source).descriptor, { id: "copy-dialog", inlineTemplate: true });
  const { code } = await transformWithEsbuild(script.content, "copy-dialog.ts", { format: "cjs" });
  const CopyRulesModal = evaluate(code, componentImports).default;
  let unmounts = 0;
  const { showDialog } = evaluate(dialogsCode, {
    vue: { ...Vue, createApp(component, props) {
      const instance = local.createApp(component, props);
      const unmount = instance.unmount;
      instance.unmount = () => { unmounts += 1; unmount(); };
      return instance;
    } },
    "./sdk": { useSDK: () => ({ window: { showDialog(definition) {
      const instance = external.createApp(definition.component);
      instance.mount(root);
      return { close: () => instance.unmount() };
    } } }) },
  });
  const dialog = showDialog(CopyRulesModal, { projectSettings: app }, { title: "Copy rules" });
  const text = (element) => element.type === "#comment" ? "" : element.text + element.children.map(text).join("");
  assert.match(text(root), /Loading projects/);
  assert.match(text(root), /Close/);
  resolve([]);
  await lookup;
  await Vue.nextTick();
  assert.match(text(root), /No other project has rules yet/);
  assert.doesNotMatch(text(root), /Loading projects/);
  dialog.close();
  assert.equal(unmounts, 1);
  assert.equal(root.children.length, 0);
});

test("deleting any rule is immediate, preserves other selections, and saves only that project", async () => {
  const { app, writes } = mount({ settingsByProject: { A: plain(original), B: plain(original) } });
  await flush();
  app.selectedId.value = "r2";
  app.removeRule("r1");
  assert.deepEqual(plain(app.settings.value.rules.map((rule) => rule.id)), ["r2"]);
  assert.equal(app.selectedId.value, "r2");
  await flush();
  assert.equal(writes.at(-1).settingsByProject.A.rules.length, 1);
  assert.deepEqual(writes.at(-1).settingsByProject.B, original);
  app.removeRule();
  assert.equal(app.selectedId.value, null);
  assert.equal(app.settings.value.rules.length, 0);
});

test("deleting a group removes its rules, preserves ungrouped rules, and saves the result", async () => {
  const { app, writes } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  app.selectedId.value = "r1";
  app.removeGroup("g");
  assert.equal(app.settings.value.groups.length, 0);
  assert.deepEqual(plain(app.settings.value.rules.map((rule) => rule.id)), ["r2"]);
  assert.equal(app.selectedId.value, "r2");
  await flush();
  assert.equal(writes.at(-1).settingsByProject.A.groups.length, 0);
  assert.equal(writes.at(-1).settingsByProject.A.rules.length, 1);
  app.newGroup();
  app.removeGroup(app.settings.value.groups[0].id);
  assert.equal(app.settings.value.rules.length, 1);
  app.settings.value.rules[0].groupId = "last-group";
  app.settings.value.groups.push({ id: "last-group", name: "Last group" });
  app.removeGroup("last-group");
  assert.equal(app.settings.value.rules.length, 0);
  assert.equal(app.selectedId.value, null);
});

test("a project switch while loading wins over an older backend status response", async () => {
  let resolve;
  const result = mount({ settingsByProject: { A: plain(original) } }, "A", new Promise((done) => { resolve = done; }));
  result.change("B");
  resolve({ projectId: "A" });
  await flush();
  assert.equal(result.app.currentProjectId.value, "B");
  assert.equal(result.app.settings.value.rules.length, 0);
  result.change(undefined);
  result.app.newRule();
  assert.equal(result.app.settings.value.rules.length, 0);
});

test("HTTPQL validation waits for 300 ms of idle typing and clears the previous status", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  const queries = [];
  sdk.backend.validateHttpql = async (query) => {
    queries.push(query);
    return query === "invalid" ? { ok: false, error: "Invalid HTTPQL" } : { ok: true };
  };
  app.selectedRule.value.httpql = "first";
  t.mock.timers.tick(200);
  app.selectedRule.value.httpql = "latest";
  t.mock.timers.tick(299);
  assert.deepEqual(queries, []);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(queries, ["latest"]);
  assert.equal(app.validation.value.ok, true);
  app.selectedRule.value.httpql = "invalid";
  assert.equal(app.validation.value, null);
  t.mock.timers.tick(300);
  await flush();
  assert.equal(app.validation.value.ok, false);
  assert.equal(app.validation.value.error, "Invalid HTTPQL");
});

test("older validation results cannot replace a newer query or another rule's status", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  const pending = [];
  sdk.backend.validateHttpql = () => new Promise((resolve) => pending.push(resolve));
  app.selectedId.value = "r2";
  t.mock.timers.tick(300);
  app.selectedRule.value.httpql = "new query";
  t.mock.timers.tick(300);
  pending[1]({ ok: false, error: "New query is invalid" });
  await flush();
  pending[0]({ ok: true });
  await flush();
  assert.equal(app.validation.value.error, "New query is invalid");
  app.selectedRule.value.httpql = "third query";
  t.mock.timers.tick(300);
  app.selectedId.value = "r1";
  pending[2]({ ok: true });
  await flush();
  assert.equal(app.validation.value, null);
});

test("validation results from the previous project are discarded", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { app, sdk, change } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  app.selectedId.value = "r2";
  let resolve;
  sdk.backend.validateHttpql = () => new Promise((done) => { resolve = done; });
  t.mock.timers.tick(300);
  change("B");
  resolve({ ok: true });
  await flush();
  assert.equal(app.validation.value, null);
});

test("automatic validation reports missing presets and backend failures", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  let calls = 0;
  sdk.backend.validateHttpql = async () => { calls += 1; throw new Error("Backend disconnected"); };
  t.mock.timers.tick(300);
  await flush();
  assert.match(app.validation.value.error, /preset "API" does not exist/);
  assert.equal(calls, 0);
  app.selectedId.value = "r2";
  t.mock.timers.tick(300);
  await flush();
  assert.match(app.validation.value.error, /Backend disconnected/);
});

test("unmount cancels pending validation and discards in-flight results", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  first.app.selectedId.value = "r2";
  first.sdk.backend.validateHttpql = () => assert.fail("Unmounted validation must not run");
  first.unmount();
  t.mock.timers.tick(300);
  const second = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  second.app.selectedId.value = "r2";
  let resolve;
  second.sdk.backend.validateHttpql = () => new Promise((done) => { resolve = done; });
  t.mock.timers.tick(300);
  second.unmount();
  resolve({ ok: true });
  await flush();
  assert.equal(second.app.validation.value, null);
});

test("backend clears rules on project switches and waits for the frontend to supply settings", async () => {
  const rpc = loadBackend();
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  assert.equal((await rpc.getBackendStatus()).ruleCount, 2);
  rpc.setActiveProject("B");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 0);
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  assert.equal((await rpc.getBackendStatus()).ruleCount, 0);
  assert.equal((await rpc.recolorize({}, "A")).cancelled, true);
  rpc.setActiveProject("A");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 0);
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  assert.equal((await rpc.getBackendStatus()).ruleCount, 2);
});

test("recoloring results from the previous project do not overwrite the new project status", async () => {
  const { app, sdk, change } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  sdk.filters.getAll = () => [{ name: "API", query: "resp.code.gte:400" }];
  let resolve;
  sdk.backend.recolorize = (id) => {
    assert.equal(id, "A");
    return new Promise((done) => { resolve = done; });
  };
  app.triggerColorizing();
  await flush();
  assert.equal(typeof resolve, "function");
  change("B");
  const status = app.statusText.value;
  resolve({ colored: 99, cleared: 0, errors: [] });
  await flush();
  assert.equal(app.statusText.value, status);
  assert.equal(app.progress.value.active, false);
  assert.deepEqual(plain(app.recoloringRuleNames.value), []);
});

test("static RPC methods work as detached Caido callbacks", async () => {
  const rpc = loadBackend();
  rpc.setActiveProject("A");
  const setSettings = rpc.setSettings;
  const getBackendStatus = rpc.getBackendStatus;
  const recolorize = rpc.recolorize;
  setSettings(new Project("A", Setting.normalize(original)));
  assert.equal((await getBackendStatus()).ruleCount, 2);
  assert.equal((await recolorize({}, "B")).cancelled, true);
});

test("extracted rescan keeps first-match priority, clears stale colors, and records ownership", async () => {
  const forgotten = [], remembered = [], updates = [];
  const rpc = loadBackend({
    ownedRequestIds: async () => ["stale"],
    forgetColoredRequests: async (_sdk, projectId, ids) => forgotten.push({ projectId, ids: plain(ids) }),
    rememberColoredRequests: async (_sdk, projectId, ids) => remembered.push({ projectId, ids: plain(ids) }),
  });
  const rules = plain(original);
  // Rescans use each rule's enabled flag, regardless of the unused master flag.
  rules.enabled = false;
  rules.rules[1].enabled = true;
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(rules)));
  let queryCount = 0;
  const sdk = {
    requests: { query() {
      return {
        filter() { return this; },
        descending(namespace, field) { assert.equal(namespace, "req"); assert.equal(field, "created_at"); return this; },
        first(size) { assert.equal(size, 500); return this; },
        execute: async () => ({
          items: (queryCount++ === 0 ? ["match"] : ["match", "second"]).map((id) => ({ request: { getId: () => id } })),
          pageInfo: { hasNextPage: false },
        }),
      };
    } },
    graphql: { execute: async (query, variables) => {
      if (query.startsWith("query")) return { data: { request: { metadata: { id: `meta-${variables.id}`, color: variables.id === "stale" ? "#123456" : null } } } };
      const data = {};
      for (let index = 0; `metadataId${index}` in variables; index += 1) {
        updates.push({ id: variables[`metadataId${index}`], color: variables[`input${index}`].color });
        data[`update_${index}`] = { metadata: { id: variables[`metadataId${index}`] } };
      }
      return { data };
    } },
  };
  const result = await rpc.recolorize(sdk, "A");
  assert.deepEqual(plain(result), { colored: 2, cleared: 1, errors: [] });
  assert.deepEqual(updates, [
    { id: "meta-match", color: "#185A6C" }, { id: "meta-second", color: "#ABCDEF" }, { id: "meta-stale", color: "" },
  ]);
  assert.deepEqual(forgotten, [{ projectId: "A", ids: ["stale"] }]);
  assert.deepEqual(remembered, [{ projectId: "A", ids: ["match", "second"] }]);
  assert.equal((await rpc.getBackendStatus()).progress.phase, "idle");
});

test("switching project during a rescan query cancels before color mutations", async () => {
  const rpc = loadBackend({ ownedRequestIds: async () => [] });
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  let resolve, mutations = 0;
  const sdk = {
    requests: { query: () => ({
      filter() { return this; }, descending() { return this; }, first() { return this; },
      execute: () => new Promise((done) => { resolve = done; }),
    }) },
    graphql: { execute: async () => { mutations += 1; return {}; } },
  };
  const scan = rpc.recolorize(sdk, "A");
  await flush();
  rpc.setActiveProject("B");
  resolve({ items: [], pageInfo: { hasNextPage: false } });
  assert.equal((await scan).cancelled, true);
  assert.equal(mutations, 0);
  assert.equal((await rpc.getBackendStatus()).projectId, "B");
});

test("live coloring stops before mutation when the project changes during metadata lookup", async () => {
  const rpc = loadBackend();
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  let resolve, calls = 0;
  const sdk = {
    requests: { matches: () => true },
    graphql: { execute: () => { calls += 1; return new Promise((done) => { resolve = done; }); } },
    console: { error: assert.fail },
  };
  const coloring = rpc.onInterceptResponse(sdk, { getId: () => "request-A" }, {});
  rpc.setActiveProject("B");
  resolve({ data: { request: { metadata: { id: "metadata-A", color: null } } } });
  await coloring;
  assert.equal(calls, 1);
});

test("copy modal renders project descriptions and copies all rules without a group picker", async () => {
  const source = readFileSync(new URL("../packages/frontend/src/components/CopyRulesModal.vue", import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "copy-rules-modal", inlineTemplate: true });
  const { code } = await transformWithEsbuild(script.content, "CopyRulesModal.ts", { format: "cjs" });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => componentImports[name] });
  const colorizer = {
    copyProjects: Vue.ref([{ id: "A", name: "Project A", groupCount: 1, ruleCount: 2 }]),
    copySourceProjectId: Vue.ref("A"), copyRules() {},
    copyLoading: Vue.ref(false), copyError: Vue.ref(""), loadCopyProjects() {},
  };
  const renderModal = module.exports.default.setup({ projectSettings: Vue.reactive(colorizer) }, { expose() {}, emit() {} });
  const render = async () => (await renderToString(Vue.createSSRApp({ render: () => renderModal({}, []) }))).replace(/<!--.*?-->/g, "");
  const html = await render();
  assert.match(html, /Project A — Groups: 1 · Rules: 2/);
  assert.doesNotMatch(html, /Group to copy/);
  assert.match(html, />\s*Copy all rules\s*<\/button>/);
  assert.match(html, /Copied rules start disabled/);
  colorizer.copyProjects.value = [];
  const empty = await render();
  assert.match(empty, /No other project has rules yet/);
  assert.doesNotMatch(empty, />\s*Copy all rules\s*<\/button>/);
  colorizer.copyLoading.value = true;
  assert.match(await render(), /Loading projects/);
  colorizer.copyLoading.value = false;
  assert.match(await render(), /No other project has rules yet/);
  colorizer.copyError.value = "Could not load project names.";
  assert.match(await render(), /Could not load project names/);
});

test("backend project lookup requests only names and IDs and propagates API errors", async () => {
  const rpc = loadBackend();
  const projects = [{ id: "A", name: "Project A" }];
  const result = await rpc.getProjects({ graphql: { execute: async (query) => {
    assert.equal(query, "query ColorizerProjects { projects { id name } }");
    return { data: { projects } };
  } } });
  assert.deepEqual(result, projects);
  await assert.rejects(rpc.getProjects({ graphql: { execute: async () => ({ errors: [{ message: "Unavailable" }] }) } }), /Unavailable/);
});

test("group deletion modal names the group, counts its rules, and provides confirm and cancel", async () => {
  const source = readFileSync(new URL("../packages/frontend/src/components/DeleteGroupModal.vue", import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "delete-group-modal", inlineTemplate: true });
  const { code } = await transformWithEsbuild(script.content, "DeleteGroupModal.ts", { format: "cjs" });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => componentImports[name] });
  for (const count of [0, 1, 3]) {
    const html = (await renderToString(Vue.createSSRApp(module.exports.default, { groupName: "API <test>", ruleCount: count }))).replace(/<!--.*?-->/g, "");
    assert.match(html, /API &lt;test&gt;/);
    assert.ok(html.includes(`and its ${count} ${count === 1 ? "rule" : "rules"}?`));
    assert.match(html, />\s*Cancel\s*<\/button>/);
    assert.match(html, />\s*Delete group\s*<\/button>/);
  }
});

test("ungrouped section is never faded as a dragged group when no group is being dragged", async () => {
  const source = readFileSync(new URL("../packages/frontend/src/components/RulesPanel.vue", import.meta.url), "utf8");
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "rules-panel", inlineTemplate: true });
  const { code } = await transformWithEsbuild(script.content, "RulesPanel.ts", { format: "cjs" });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => componentImports[name] ?? { default: {}, __esModule: true },
  });
  const group = { id: "g", name: "Group 1" };
  const props = {
    rules: [], groups: [group], selectedId: null,
    sections: [{ id: "g", name: group.name, group, rules: [] }, { id: null, name: "Ungrouped", group: null, rules: [] }],
    draggedRuleId: null, draggedGroupId: null, dropTargetRuleId: null,
    dropTargetGroupId: undefined, dropPosition: null, groupOrderTargetId: undefined,
    groupDropPosition: null, groupAllEnabled: () => false,
  };
  const sectionClasses = async () => {
    const html = await renderToString(Vue.createSSRApp(module.exports.default, props));
    return [...html.matchAll(/<section class="([^"]*)"/g)].map((match) => match[1]);
  };
  const initial = await sectionClasses();
  assert.equal(initial.length, 2);
  assert.ok(initial.every((classes) => !classes.split(" ").includes("hc-dragging-group")));
  props.draggedGroupId = "g";
  const dragging = await sectionClasses();
  assert.ok(dragging[0].split(" ").includes("hc-dragging-group"));
  assert.ok(!dragging[1].split(" ").includes("hc-dragging-group"));
});
