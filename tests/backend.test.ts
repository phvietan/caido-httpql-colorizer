import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { Project, Setting } from "shared";
import { loadBackend } from "./helpers/backend";
import { original, plain, flush } from "./helpers/fixtures";

test("backend startup initializes the table before handlers and CRUD never repeats initialization", async () => {
  const db = await vi.importActual("../packages/backend/src/db");
  const rpc = await loadBackend(db);
  const { init } = await import("../packages/backend/src/index");
  const order = [];
  const sdk = {
    meta: {
      db: async () => ({
        exec: async () => {
          order.push("initialize");
        },
        prepare: async () => ({
          run: async () => {},
          all: async () => [{ request_id: "r1" }],
        }),
      }),
    },
    api: {
      register: () => {
        order.push("register");
      },
    },
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
  sdk.meta.db = async () => {
    throw new Error("Database unavailable");
  };
  await assert.rejects(init(sdk), /Database unavailable/);
  assert.equal(order.length, 0);
});

test("API registration normalizes settings into a Project before calling the RPC handler", async () => {
  const rpc = await loadBackend({ ensureDatabase: async () => {} });
  const { init } = await import("../packages/backend/src/index");
  const handlers = {};
  let received;
  const setSettings = rpc.setSettings;
  rpc.setSettings = (project) => {
    received = project;
    setSettings(project);
  };
  const sdk = {
    api: {
      register: (name, handler) => {
        handlers[name] = handler;
      },
    },
    projects: { getCurrent: async () => ({ getId: () => "A" }) },
    events: { onProjectChange() {}, onInterceptResponse() {} },
    console: { log() {} },
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

test("backend clears rules on project switches and waits for the frontend to supply settings", async () => {
  const rpc = await loadBackend();
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

test("static RPC methods work as detached Caido callbacks", async () => {
  const rpc = await loadBackend();
  rpc.setActiveProject("A");
  const setSettings = rpc.setSettings;
  const getBackendStatus = rpc.getBackendStatus;
  const recolorize = rpc.recolorize;
  setSettings(new Project("A", Setting.normalize(original)));
  assert.equal((await getBackendStatus()).ruleCount, 2);
  assert.equal((await recolorize({}, "B")).cancelled, true);
});

test("extracted rescan keeps first-match priority, clears stale colors, and records ownership", async () => {
  const forgotten = [],
    remembered = [],
    updates = [];
  const rpc = await loadBackend({
    ownedRequestIds: async () => ["stale"],
    forgetColoredRequests: async (_sdk, projectId, ids) =>
      forgotten.push({ projectId, ids: plain(ids) }),
    rememberColoredRequests: async (_sdk, projectId, ids) =>
      remembered.push({ projectId, ids: plain(ids) }),
  });
  const rules = plain(original);
  // Rescans use each rule's enabled flag, regardless of the unused master flag.
  rules.enabled = false;
  rules.rules[1].enabled = true;
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(rules)));
  let queryCount = 0;
  const sdk = {
    requests: {
      query() {
        return {
          filter() {
            return this;
          },
          descending(namespace, field) {
            assert.equal(namespace, "req");
            assert.equal(field, "created_at");
            return this;
          },
          first(size) {
            assert.equal(size, 500);
            return this;
          },
          execute: async () => ({
            items: (queryCount++ === 0 ? ["match"] : ["match", "second"]).map(
              (id) => ({ request: { getId: () => id } }),
            ),
            pageInfo: { hasNextPage: false },
          }),
        };
      },
    },
    graphql: {
      execute: async (query, variables) => {
        if (query.startsWith("query"))
          return {
            data: {
              request: {
                metadata: {
                  id: `meta-${variables.id}`,
                  color: variables.id === "stale" ? "#123456" : null,
                },
              },
            },
          };
        const data = {};
        for (let index = 0; `metadataId${index}` in variables; index += 1) {
          updates.push({
            id: variables[`metadataId${index}`],
            color: variables[`input${index}`].color,
          });
          data[`update_${index}`] = {
            metadata: { id: variables[`metadataId${index}`] },
          };
        }
        return { data };
      },
    },
  };
  const result = await rpc.recolorize(sdk, "A");
  assert.deepEqual(plain(result), { colored: 2, cleared: 1, errors: [] });
  assert.deepEqual(updates, [
    { id: "meta-match", color: "#185A6C" },
    { id: "meta-second", color: "#ABCDEF" },
    { id: "meta-stale", color: "" },
  ]);
  assert.deepEqual(forgotten, [{ projectId: "A", ids: ["stale"] }]);
  assert.deepEqual(remembered, [{ projectId: "A", ids: ["match", "second"] }]);
  assert.equal((await rpc.getBackendStatus()).progress.phase, "idle");
});

test("switching project during a rescan query cancels before color mutations", async () => {
  const rpc = await loadBackend({ ownedRequestIds: async () => [] });
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  let resolve,
    mutations = 0;
  const sdk = {
    requests: {
      query: () => ({
        filter() {
          return this;
        },
        descending() {
          return this;
        },
        first() {
          return this;
        },
        execute: () =>
          new Promise((done) => {
            resolve = done;
          }),
      }),
    },
    graphql: {
      execute: async () => {
        mutations += 1;
        return {};
      },
    },
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
  const rpc = await loadBackend();
  rpc.setActiveProject("A");
  rpc.setSettings(new Project("A", Setting.normalize(original)));
  let resolve,
    calls = 0;
  const sdk = {
    requests: { matches: () => true },
    graphql: {
      execute: () => {
        calls += 1;
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
    console: { error: assert.fail },
  };
  const coloring = rpc.onInterceptResponse(
    sdk,
    { getId: () => "request-A" },
    {},
  );
  rpc.setActiveProject("B");
  resolve({
    data: { request: { metadata: { id: "metadata-A", color: null } } },
  });
  await coloring;
  assert.equal(calls, 1);
});

test("backend project lookup requests only names and IDs and propagates API errors", async () => {
  const rpc = await loadBackend();
  const projects = [{ id: "A", name: "Project A" }];
  const result = await rpc.getProjects({
    graphql: {
      execute: async (query) => {
        assert.equal(query, "query ColorizerProjects { projects { id name } }");
        return { data: { projects } };
      },
    },
  });
  assert.deepEqual(result, projects);
  await assert.rejects(
    rpc.getProjects({
      graphql: {
        execute: async () => ({ errors: [{ message: "Unavailable" }] }),
      },
    }),
    /Unavailable/,
  );
});
