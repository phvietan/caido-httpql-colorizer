import { createApp, defineComponent, h } from "vue";
import type { App, Component } from "vue";
import type { DialogOptions } from "@caido/sdk-frontend";
import { useSDK } from "./sdk";

export function showDialog(component: Component, props: Record<string, unknown>, options: DialogOptions) {
  let app: App | undefined;
  return useSDK().window.showDialog({
    // Keep refs and child components in our Vue runtime, rather than Caido's renderer.
    component: defineComponent({
      render: () => h("div"),
      mounted() {
        app = createApp(component, props);
        app.mount(this.$el);
      },
      beforeUnmount() {
        app?.unmount();
      },
    }),
  }, options);
}
