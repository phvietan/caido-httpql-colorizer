import type { Caido } from "@caido/sdk-frontend";
import type { API } from "shared";
import { createApp } from "vue";
import App from "./App.vue";
import { setSDK } from "./sdk";

export async function init(sdk: Caido<API>) {
  setSDK(sdk);

  const root = document.createElement("div");
  root.id = "httpql-colorizer-root";
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
    minHeight: "0",
    overflow: "hidden",
  });

  const app = createApp(App);
  app.mount(root);

  sdk.navigation.addPage("/httpql-colorizer", {
    body: root,
  });

  sdk.sidebar.registerItem("HTTPQL Colorizer", "/httpql-colorizer", {
    icon: "fas fa-palette",
  });
}
