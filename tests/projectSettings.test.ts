import assert from "node:assert/strict";
import { test } from "vitest";
import { mount } from "./helpers/frontend";
import { original, plain, flush } from "./helpers/fixtures";

test("switching projects saves edits, starts new projects empty, and restores previous rules", async () => {
  const { app, writes, backendWrites, change } = mount({
    settingsByProject: { A: plain(original) },
  });
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
  const { app, writes } = mount(
    { settingsByProject: { A: plain(original) } },
    "B",
  );
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
  assert.ok(
    writes
      .at(-1)
      .settingsByProject.B.rules.some((rule) => rule.id === existingRuleId),
  );
  assert.equal(writes.at(-1).settingsByProject.B.rules[2].groupId, null);
});

test("project-name lookup uses the backend, never exposes UUIDs, and reports lookup failures", async () => {
  const { app, sdk } = mount(
    { settingsByProject: { A: plain(original) } },
    "B",
  );
  await flush();
  assert.equal(app.copyProjects.value.length, 0);
  sdk.graphql.projects = () => {
    throw new Error("Frontend GraphQL unavailable");
  };
  await app.loadCopyProjects();
  assert.equal(app.copyProjects.value[0].name, "Project A");
  sdk.backend.getProjects = async () => {
    throw new Error("Connection failed");
  };
  await app.loadCopyProjects();
  assert.match(app.copyError.value, /Could not load project names/);
  assert.equal(app.copyLoading.value, false);
  assert.equal(app.copySourceProjectId.value, "");
});

test("no other project with rules skips the backend lookup and immediately leaves loading", async () => {
  const { app, sdk } = mount({
    settingsByProject: {
      A: plain(original),
      B: { enabled: true, groups: [{ id: "empty", name: "Empty" }], rules: [] },
    },
  });
  await flush();
  sdk.backend.getProjects = () => {
    throw new Error("Must not fetch names when no other project has rules");
  };
  await app.loadCopyProjects();
  assert.equal(app.copyLoading.value, false);
  assert.equal(app.copyError.value, "");
  assert.equal(app.copyProjects.value.length, 0);
  assert.equal(app.copySourceProjectId.value, "");
});

test("project switches invalidate pending copy lookups without overwriting a newer lookup", async () => {
  const { app, sdk, change } = mount(
    { settingsByProject: { A: plain(original) } },
    "B",
  );
  await flush();
  let rejectOld, resolveNew;
  sdk.backend.getProjects = () =>
    new Promise((_resolve, reject) => {
      rejectOld = reject;
    });
  const oldLookup = app.loadCopyProjects();
  assert.equal(app.copyLoading.value, true);
  change("C");
  assert.equal(app.copyLoading.value, false);
  sdk.backend.getProjects = () =>
    new Promise((resolve) => {
      resolveNew = resolve;
    });
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

test("deleting any rule is immediate, preserves other selections, and saves only that project", async () => {
  const { app, writes } = mount({
    settingsByProject: { A: plain(original), B: plain(original) },
  });
  await flush();
  app.selectedId.value = "r2";
  app.removeRule("r1");
  assert.deepEqual(plain(app.settings.value.rules.map((rule) => rule.id)), [
    "r2",
  ]);
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
  assert.deepEqual(plain(app.settings.value.rules.map((rule) => rule.id)), [
    "r2",
  ]);
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
  const result = mount(
    { settingsByProject: { A: plain(original) } },
    "A",
    new Promise((done) => {
      resolve = done;
    }),
  );
  result.change("B");
  resolve({ projectId: "A" });
  await flush();
  assert.equal(result.app.currentProjectId.value, "B");
  assert.equal(result.app.settings.value.rules.length, 0);
  result.change(undefined);
  result.app.newRule();
  assert.equal(result.app.settings.value.rules.length, 0);
});

test("recoloring results from the previous project do not overwrite the new project status", async () => {
  const { app, sdk, change } = mount({
    settingsByProject: { A: plain(original) },
  });
  await flush();
  sdk.filters.getAll = () => [{ name: "API", query: "resp.code.gte:400" }];
  let resolve;
  sdk.backend.recolorize = (id) => {
    assert.equal(id, "A");
    return new Promise((done) => {
      resolve = done;
    });
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
