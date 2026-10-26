import assert from "node:assert/strict";
import { test } from "vitest";
import { Project, Setting } from "shared";
import * as sharedHelpers from "../packages/shared/src/helpers";
import * as presets from "../packages/frontend/src/presets";
import { original, plain } from "./helpers/fixtures";

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
  assert.deepEqual(new Setting().toJSON(), {
    enabled: true,
    groups: [],
    rules: [],
  });
  assert.equal(new Setting({ ...original, groups: [] }).rules[0].groupId, null);
});

test("Setting normalizes backend input while leaving frontend editing values untouched", () => {
  const raw = {
    enabled: 1,
    groups: [{ id: 7, name: undefined }],
    rules: [
      {
        id: 1,
        name: undefined,
        httpql: ' req.host.eq:"example.com" ',
        color: " #aabbcc ",
        enabled: 1,
        groupId: 7,
      },
    ],
  };
  const normalized = Setting.normalize(raw);
  assert.equal(normalized.groups[0].id, "7");
  assert.equal(normalized.rules[0].groupId, "7");
  assert.equal(normalized.rules[0].httpql, 'req.host.eq:"example.com"');
  assert.equal(normalized.rules[0].color, "#AABBCC");
  assert.equal(normalized.rules[0].enabled, true);
  assert.equal(raw.rules[0].color, " #aabbcc ");
  assert.deepEqual(Setting.normalize({}).toJSON(), {
    enabled: false,
    groups: [],
    rules: [],
  });
});

test("extracted preset handling expands known presets and disables missing references", () => {
  const known = presets.prepareBackendSettings(original, [
    { alias: "api", name: "API", query: 'req.host.eq:"example.com"' },
  ]);
  assert.equal(
    known.backend.rules[0].httpql,
    '(req.host.eq:"example.com") AND resp.code.gte:400',
  );
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
  source.groups.push(
    { id: "g2", name: "Second group" },
    { id: "empty", name: "Empty group" },
  );
  source.rules.push({ ...source.rules[0], id: "r3", groupId: "g2" });
  const copied = new Setting(source).copyRules(uid);
  assert.equal(copied.groups.length, 3);
  assert.equal(copied.rules[2].groupId, copied.groups[1].id);
  assert.equal(
    new Set([...copied.groups, ...copied.rules].map((item) => item.id)).size,
    6,
  );
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
  assert.equal(
    new Setting({ ...original, rules: [] }).copyRules(uid).groups.length,
    1,
  );
  assert.equal(
    new Setting({ ...original, groups: [] }).copyRules(uid).rules.length,
    2,
  );
});
