import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { mount } from "./helpers/frontend";
import { original, plain, flush } from "./helpers/fixtures";

test("HTTPQL validation waits for 300 ms of idle typing and clears the previous status", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  const queries = [];
  sdk.backend.validateHttpql = async (query) => {
    queries.push(query);
    return query === "invalid"
      ? { ok: false, error: "Invalid HTTPQL" }
      : { ok: true };
  };
  app.selectedRule.value.httpql = "first";
  vi.advanceTimersByTime(200);
  app.selectedRule.value.httpql = "latest";
  vi.advanceTimersByTime(299);
  assert.deepEqual(queries, []);
  vi.advanceTimersByTime(1);
  await flush();
  assert.deepEqual(queries, ["latest"]);
  assert.equal(app.validation.value.ok, true);
  app.selectedRule.value.httpql = "invalid";
  assert.equal(app.validation.value, null);
  vi.advanceTimersByTime(300);
  await flush();
  assert.equal(app.validation.value.ok, false);
  assert.equal(app.validation.value.error, "Invalid HTTPQL");
});

test("older validation results cannot replace a newer query or another rule's status", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  const pending = [];
  sdk.backend.validateHttpql = () =>
    new Promise((resolve) => pending.push(resolve));
  app.selectedId.value = "r2";
  vi.advanceTimersByTime(300);
  app.selectedRule.value.httpql = "new query";
  vi.advanceTimersByTime(300);
  pending[1]({ ok: false, error: "New query is invalid" });
  await flush();
  pending[0]({ ok: true });
  await flush();
  assert.equal(app.validation.value.error, "New query is invalid");
  app.selectedRule.value.httpql = "third query";
  vi.advanceTimersByTime(300);
  app.selectedId.value = "r1";
  pending[2]({ ok: true });
  await flush();
  assert.equal(app.validation.value, null);
});

test("validation results from the previous project are discarded", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { app, sdk, change } = mount({
    settingsByProject: { A: plain(original) },
  });
  await flush();
  app.selectedId.value = "r2";
  let resolve;
  sdk.backend.validateHttpql = () =>
    new Promise((done) => {
      resolve = done;
    });
  vi.advanceTimersByTime(300);
  change("B");
  resolve({ ok: true });
  await flush();
  assert.equal(app.validation.value, null);
});

test("automatic validation reports missing presets and backend failures", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { app, sdk } = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  let calls = 0;
  sdk.backend.validateHttpql = async () => {
    calls += 1;
    throw new Error("Backend disconnected");
  };
  vi.advanceTimersByTime(300);
  await flush();
  assert.match(app.validation.value.error, /preset "API" does not exist/);
  assert.equal(calls, 0);
  app.selectedId.value = "r2";
  vi.advanceTimersByTime(300);
  await flush();
  assert.match(app.validation.value.error, /Backend disconnected/);
});

test("unmount cancels pending validation and discards in-flight results", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const first = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  first.app.selectedId.value = "r2";
  first.sdk.backend.validateHttpql = () =>
    assert.fail("Unmounted validation must not run");
  first.unmount();
  vi.advanceTimersByTime(300);
  const second = mount({ settingsByProject: { A: plain(original) } });
  await flush();
  second.app.selectedId.value = "r2";
  let resolve;
  second.sdk.backend.validateHttpql = () =>
    new Promise((done) => {
      resolve = done;
    });
  vi.advanceTimersByTime(300);
  second.unmount();
  resolve({ ok: true });
  await flush();
  assert.equal(second.app.validation.value, null);
});
