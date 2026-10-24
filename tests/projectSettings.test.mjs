import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
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
const backendHelpers = await import(helpersUrl);
const settingUrl = moduleUrl((await compile("../packages/shared/src/Setting.ts")).replace('"./helpers"', JSON.stringify(helpersUrl)));
const { Setting } = await import(settingUrl);
const { Project } = await import(moduleUrl((await compile("../packages/shared/src/Project.ts")).replace('"./Setting"', JSON.stringify(settingUrl))));
const { mapWithConcurrency } = await import(moduleUrl(await compile("../packages/shared/src/concurrency.ts")));
const shared = { Project, Setting, mapWithConcurrency };
const composable = await compile("../packages/frontend/src/useColorizer.ts", "cjs");
const dragCode = await compile("../packages/frontend/src/useRuleDrag.ts", "cjs");
const presets = await import(moduleUrl(await compile("../packages/frontend/src/presets.ts")));
const backend = await compile("../packages/backend/src/rpc.ts", "cjs");
const metadataCode = await compile("../packages/backend/src/metadata.ts", "cjs");
const historyCode = await compile("../packages/backend/src/history.ts", "cjs");
const databaseCode = await compile("../packages/backend/src/db.ts", "cjs");
const batchesCode = await compile("../packages/backend/src/batches.ts", "cjs");
const startupCode = await compile("../packages/backend/src/index.ts", "cjs");

function evaluate(code, imports) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

function loadBackend(db = {}) {
  const metadata = evaluate(metadataCode, { shared });
  const history = evaluate(historyCode, { shared, "./metadata": metadata, "./db": db });
  return evaluate(backend, { shared, "./metadata": metadata, "./history": history, "./db": db });
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
const original = {
  enabled: true,
  groups: [{ id: "g", name: "API" }],
  rules: [
    { id: "r1", name: "Errors", httpql: 'preset:"API" AND resp.code.gte:400', color: "#185A6C", enabled: true, groupId: "g" },
    { id: "r2", name: "Other", httpql: "resp.code.eq:200", color: "#abcdef", enabled: false, groupId: null },
  ],
};

test("hex normalization trims, uppercases, and defaults invalid colors", () => {
  assert.equal(backendHelpers.normalizeHex(" #a1b2c3 "), "#A1B2C3");
  assert.equal(backendHelpers.normalizeHex("red"), "#185A6C");
  assert.equal(backendHelpers.normalizeHex("#abc"), "#185A6C");
});

test("backend startup initializes the table before handlers and CRUD never repeats initialization", async () => {
  const batches = evaluate(batchesCode, {});
  const db = evaluate(databaseCode, { "./batches": batches });
  const rpc = loadBackend(db);
  const { init } = evaluate(startupCode, { "./db": db, "./rpc": rpc });
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
  await db.rememberColoredRequest(sdk, "A", "r1");
  await db.rememberColoredRequests(sdk, "A", ["r2", "r3"]);
  assert.deepEqual(plain(await db.ownedRequestIds(sdk, "A")), ["r1"]);
  await db.forgetColoredRequests(sdk, "A", ["r1"]);
  assert.equal(order.filter((item) => item === "initialize").length, 1);
  order.length = 0;
  sdk.meta.db = async () => { throw new Error("Database unavailable"); };
  await assert.rejects(init(sdk), /Database unavailable/);
  assert.equal(order.length, 0);
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
    },
    filters: { getAll: () => [] },
    projects: { onCurrentProjectChange: (callback) => { listener = callback; return { stop() {} }; } },
    graphql: { projects: async () => ({ projects: [{ id: "A", name: "Project A" }] }) },
    log: { error() {} }, window: { showToast() {} },
  };
  const vue = {
    ref: (value) => ({ value }), computed: (fn) => ({ get value() { return fn(); } }),
    onMounted: (fn) => { mounted = fn; }, onBeforeUnmount() {},
  };
  const drag = evaluate(dragCode, { vue });
  const app = evaluate(composable, { vue, shared, "./sdk": { useSDK: () => sdk }, "./useRuleDrag": drag, "./presets": presets }).useColorizer();
  mounted();
  return { app, sdk, writes, backendWrites, change: (id) => listener({ projectId: id }) };
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

test("validation results from the previous project are discarded", async () => {
  const { app, sdk, change } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  app.selectedId.value = "r2";
  let resolve;
  sdk.backend.validateHttpql = () => new Promise((done) => { resolve = done; });
  const validation = app.validate();
  change("B");
  resolve({ ok: true });
  await validation;
  assert.equal(app.validation.value, null);
});

test("backend switches rule sets and rejects rescans belonging to another project", async () => {
  const rpc = loadBackend();
  rpc.setActiveProject("A");
  rpc.setSettings({}, original, "A");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 2);
  rpc.setActiveProject("B");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 0);
  rpc.setSettings({}, original, "A");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 0);
  assert.equal((await rpc.recolorize({}, "A")).cancelled, true);
  rpc.setActiveProject("A");
  assert.equal((await rpc.getBackendStatus()).ruleCount, 2);
});

test("extracted rescan keeps first-match priority, clears stale colors, and records ownership", async () => {
  const forgotten = [], remembered = [], updates = [];
  const rpc = loadBackend({
    ownedRequestIds: async () => ["stale"],
    forgetColoredRequests: async (_sdk, projectId, ids) => forgotten.push({ projectId, ids: plain(ids) }),
    rememberColoredRequests: async (_sdk, projectId, ids) => remembered.push({ projectId, ids: plain(ids) }),
  });
  const rules = plain(original);
  rules.rules[1].enabled = true;
  rpc.setActiveProject("A");
  rpc.setSettings({}, rules, "A");
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
  rpc.setSettings({}, original, "A");
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
  rpc.setSettings({}, original, "A");
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
  vm.runInNewContext(code, { module, exports: module.exports, require: () => Vue });
  const colorizer = {
    copyProjects: Vue.ref([{ id: "A", name: "Project A", groupCount: 1, ruleCount: 2 }]),
    copySourceProjectId: Vue.ref("A"), copyRules() {},
    copyLoading: Vue.ref(false), copyError: Vue.ref(""), loadCopyProjects() {},
  };
  const renderModal = module.exports.default.setup({ colorizer: Vue.reactive(colorizer) }, { expose() {}, emit() {} });
  const render = () => renderToString(Vue.createSSRApp({ render: () => renderModal({}, []) }));
  const html = await render();
  assert.match(html, /Project A — Groups: 1 · Rules: 2/);
  assert.doesNotMatch(html, /Group to copy/);
  assert.match(html, /Copy all rules<\/button>/);
  assert.match(html, /Copied rules start disabled/);
  colorizer.copyProjects.value = [];
  const empty = await render();
  assert.match(empty, /No other project has rules yet/);
  assert.doesNotMatch(empty, /Copy all rules<\/button>/);
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
  vm.runInNewContext(code, { module, exports: module.exports, require: () => Vue });
  for (const count of [0, 1, 3]) {
    const html = await renderToString(Vue.createSSRApp(module.exports.default, { groupName: "API <test>", ruleCount: count }));
    assert.match(html, /API &lt;test&gt;/);
    assert.ok(html.includes(`and its ${count} ${count === 1 ? "rule" : "rules"}?`));
    assert.match(html, />Cancel<\/button>/);
    assert.match(html, />Delete group<\/button>/);
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
    require: (name) => name === "vue" ? Vue : { default: {}, __esModule: true },
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
  assert.deepEqual(await sectionClasses(), ["rule-group", "rule-group"]);
  props.draggedGroupId = "g";
  assert.deepEqual(await sectionClasses(), ["rule-group dragging-group", "rule-group"]);
});
