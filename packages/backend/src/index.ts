/// <reference types="@caido/sdk-backend" />

import type { APISDK, SDK } from "caido:plugin";
import type { API } from "shared";
import { ensureDatabase } from "./db";
import {
  getBackendStatus,
  onInterceptResponse,
  recolorize,
  setSettings,
  validateHttpql,
} from "./rpc";

export async function init(sdk: SDK) {
  const api = sdk.api as APISDK<API, Record<string, never>>;

  await ensureDatabase(sdk);
  api.register("setSettings", setSettings);
  api.register("recolorize", recolorize);
  api.register("validateHttpql", validateHttpql);
  api.register("getBackendStatus", getBackendStatus);
  sdk.events.onInterceptResponse(onInterceptResponse);
  sdk.console.log("[HTTPQL Colorizer] Backend initialized.");
}
