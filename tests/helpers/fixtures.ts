import type { Settings } from "shared";

export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const flush = () => new Promise<void>(setImmediate);
export const original: Settings = {
  enabled: true,
  groups: [{ id: "g", name: "API" }],
  rules: [
    {
      id: "r1",
      name: "Errors",
      httpql: 'preset:"API" AND resp.code.gte:400',
      color: "#185A6C",
      enabled: true,
      groupId: "g",
    },
    {
      id: "r2",
      name: "Other",
      httpql: "resp.code.eq:200",
      color: "#abcdef",
      enabled: false,
      groupId: null,
    },
  ],
};
