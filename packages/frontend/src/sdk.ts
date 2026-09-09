import type { Caido } from "@caido/sdk-frontend";
import type { API } from "shared";

let sdk: Caido<API> | undefined;

export function setSDK(value: Caido<API>) {
  sdk = value;
}

export function useSDK(): Caido<API> {
  if (!sdk) throw new Error("Caido SDK has not been initialized.");
  return sdk;
}
