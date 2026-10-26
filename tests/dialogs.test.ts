import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as Vue from "vue";
import { renderToString } from "vue/server-renderer";
import CopyRulesModal from "../packages/frontend/src/components/CopyRulesModal.vue";
import DeleteGroupModal from "../packages/frontend/src/components/DeleteGroupModal.vue";
import RulesPanel from "../packages/frontend/src/components/RulesPanel.vue";
import { showDialog } from "../packages/frontend/src/dialogs";
import { setSDK } from "../packages/frontend/src/sdk";
import { mount } from "./helpers/frontend";
import { original, plain, flush } from "./helpers/fixtures";

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return { ...actual, createApp: vi.fn(actual.createApp) };
});
afterEach(() => vi.mocked(Vue.createApp).mockReset());

test("SDK dialogs render buttons and loading updates with a separate host Vue runtime", async () => {
  const HostVue = vm.runInNewContext(
    readFileSync(
      createRequire(import.meta.url).resolve("vue/dist/vue.global.prod.js"),
      "utf8",
    ) + ";Vue",
    { console },
  );
  const node = (type, text = "") => ({
    type,
    text,
    children: [],
    parent: null,
    props: {},
  });
  const remove = (child) => {
    const siblings = child.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(child), 1);
    child.parent = null;
  };
  const host = {
    insert(child, parent, anchor) {
      remove(child);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(
        index < 0 ? parent.children.length : index,
        0,
        child,
      );
      child.parent = parent;
    },
    remove,
    createElement: (type) => node(type),
    createText: (text) => node("#text", text),
    createComment: (text) => node("#comment", text),
    setText: (element, text) => {
      element.text = text;
    },
    setElementText: (element, text) => {
      element.text = text;
      element.children = [];
    },
    parentNode: (element) => element.parent,
    nextSibling: (element) =>
      element.parent?.children[element.parent.children.indexOf(element) + 1],
    patchProp: (element, key, _previous, value) => {
      element.props[key] = value;
    },
  };
  const local = Vue.createRenderer(host);
  const external = HostVue.createRenderer(host);
  const root = node("root");
  const { app, sdk } = mount(
    { settingsByProject: { A: plain(original) } },
    "B",
  );
  await flush();
  let resolve;
  sdk.backend.getProjects = () =>
    new Promise((done) => {
      resolve = done;
    });
  const lookup = app.loadCopyProjects();
  let unmounts = 0;
  vi.mocked(Vue.createApp).mockImplementation((component, props) => {
    const instance = local.createApp(component, props);
    const unmount = instance.unmount;
    instance.unmount = () => { unmounts += 1; unmount(); };
    return instance;
  });
  setSDK({ window: { showDialog(definition) {
    const instance = external.createApp(definition.component);
    instance.mount(root);
    return { close: () => instance.unmount() };
  } } });
  const dialog = showDialog(
    CopyRulesModal,
    { projectSettings: app },
    { title: "Copy rules" },
  );
  const text = (element) =>
    element.type === "#comment"
      ? ""
      : element.text + element.children.map(text).join("");
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

test("copy modal renders project descriptions and copies all rules without a group picker", async () => {
  const colorizer = {
    copyProjects: Vue.ref([
      { id: "A", name: "Project A", groupCount: 1, ruleCount: 2 },
    ]),
    copySourceProjectId: Vue.ref("A"),
    copyRules() {},
    copyLoading: Vue.ref(false),
    copyError: Vue.ref(""),
    loadCopyProjects() {},
  };
  const render = async () => (await renderToString(
    Vue.createSSRApp(CopyRulesModal, { projectSettings: Vue.reactive(colorizer) }),
  )).replace(/<!--.*?-->/g, "");
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

test("group deletion modal names the group, counts its rules, and provides confirm and cancel", async () => {
  for (const count of [0, 1, 3]) {
    const html = (
      await renderToString(
        Vue.createSSRApp(DeleteGroupModal, {
          groupName: "API <test>",
          ruleCount: count,
        }),
      )
    ).replace(/<!--.*?-->/g, "");
    assert.match(html, /API &lt;test&gt;/);
    assert.ok(
      html.includes(`and its ${count} ${count === 1 ? "rule" : "rules"}?`),
    );
    assert.match(html, />\s*Cancel\s*<\/button>/);
    assert.match(html, />\s*Delete group\s*<\/button>/);
  }
});

test("ungrouped section is never faded as a dragged group when no group is being dragged", async () => {
  const group = { id: "g", name: "Group 1" };
  const props = {
    rules: [],
    groups: [group],
    selectedId: null,
    sections: [
      { id: "g", name: group.name, group, rules: [] },
      { id: null, name: "Ungrouped", group: null, rules: [] },
    ],
    draggedRuleId: null,
    draggedGroupId: null,
    dropTargetRuleId: null,
    dropTargetGroupId: undefined,
    dropPosition: null,
    groupOrderTargetId: undefined,
    groupDropPosition: null,
    groupAllEnabled: () => false,
  };
  const sectionClasses = async () => {
    const html = await renderToString(
      Vue.createSSRApp(RulesPanel, props),
    );
    return [...html.matchAll(/<section class="([^"]*)"/g)].map(
      (match) => match[1],
    );
  };
  const initial = await sectionClasses();
  assert.equal(initial.length, 2);
  assert.ok(
    initial.every(
      (classes) => !classes.split(" ").includes("hc-dragging-group"),
    ),
  );
  props.draggedGroupId = "g";
  const dragging = await sectionClasses();
  assert.ok(dragging[0].split(" ").includes("hc-dragging-group"));
  assert.ok(!dragging[1].split(" ").includes("hc-dragging-group"));
});
