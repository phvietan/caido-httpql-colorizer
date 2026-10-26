import { vi } from "vitest";
import * as shared from "shared";

export async function loadBackend(db: Partial<typeof import("../../packages/backend/src/db")> = {}) {
  vi.resetModules();
  vi.doMock("shared", () => shared);
  vi.doMock("../../packages/backend/src/db", async () => ({
    ...await vi.importActual("../../packages/backend/src/db"),
    ...db,
  }));
  return (await import("../../packages/backend/src/rpc")).RPC;
}
