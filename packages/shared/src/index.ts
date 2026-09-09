export { mapWithConcurrency } from "./concurrency";

export type ColorRule = {
  id: string;
  name: string;
  httpql: string;
  color: string;
  enabled: boolean;
};

export type Settings = {
  enabled: boolean;
  rules: ColorRule[];
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ApplyResult = {
  colored: number;
  cleared: number;
  errors: string[];
};

export type ApplyProgress = {
  active: boolean;
  current: number;
  total: number;
  phase: "idle" | "clearing" | "finding" | "applying";
};

export type API = {
  setSettings(settings: Settings): Promise<ApplyResult>;
  validateHttpql(query: string): Promise<ValidationResult>;
  getBackendStatus(): Promise<{
    initialized: boolean;
    enabled: boolean;
    ruleCount: number;
    progress: ApplyProgress;
  }>;
};
