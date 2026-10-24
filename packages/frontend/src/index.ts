import type { Caido } from "@caido/sdk-frontend";
import type { API } from "shared";
import { createApp } from "vue";
import App from "./App.vue";
import { setSDK } from "./sdk";

export async function init(sdk: Caido<API>) {
  setSDK(sdk);

  const root = document.createElement("div");
  root.id = "httpql-colorizer-root";
  root.className = "hc-h-full hc-w-full hc-min-h-0 hc-overflow-hidden";

  const app = createApp(App);
  app.mount(root);

  sdk.navigation.addPage("/httpql-colorizer", {
    body: root,
  });

  sdk.sidebar.registerItem("HTTPQL Colorizer", "/httpql-colorizer", {
    icon: "fas fa-palette",
  });
}
