/// <reference types="@caido/sdk-backend" />

import type { APISDK, SDK } from "caido:plugin";
import type { API } from "shared";
import { Project, Setting } from "shared";
import { ensureDatabase } from "./db";
import { RPC } from "./rpc";

export async function init(sdk: SDK) {
  const api = sdk.api as APISDK<API, Record<string, never>>;

  await ensureDatabase(sdk);
  api.register("setSettings", (_sdk, next, projectId) => {
    if (!projectId) return;
    RPC.setSettings(new Project(String(projectId), Setting.normalize(next)));
  });
  api.register("recolorize", RPC.recolorize);
  api.register("validateHttpql", RPC.validateHttpql);
  api.register("getBackendStatus", RPC.getBackendStatus);
  api.register("getProjects", RPC.getProjects);
  const currentProject = await sdk.projects.getCurrent();
  RPC.setActiveProject(currentProject ? String(currentProject.getId()) : null);
  // Synchronize from Caido itself, so delayed frontend calls cannot change the backend's current project.
  sdk.events.onProjectChange((_sdk, project) => {
    RPC.setActiveProject(project ? String(project.getId()) : null);
  });
  sdk.events.onInterceptResponse(RPC.onInterceptResponse);
  sdk.console.log("[HTTPQL Colorizer] Backend initialized.");
}
