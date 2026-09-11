export { mapWithConcurrency } from "./concurrency";

export type ColorRule = {
  id: string;
  name: string;
  httpql: string;
  color: string;
  enabled: boolean;
  groupId: string | null;
};

export type RuleGroup = {
  id: string;
  name: string;
};

export type Settings = {
  enabled: boolean;
  groups: RuleGroup[];
  rules: ColorRule[];
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ApplyResult = {
  colored: number;
  cleared: number;
  errors: string[];
  cancelled?: boolean;
};

export type ApplyProgress = {
  active: boolean;
  current: number;
  total: number;
  phase: "idle" | "clearing" | "finding" | "applying";
};

export type API = {
  setSettings(settings: Settings): void;
  recolorize(): Promise<ApplyResult>;
  validateHttpql(query: string): Promise<ValidationResult>;
  getBackendStatus(): Promise<{
    initialized: boolean;
    enabled: boolean;
    projectId: string | null;
    ruleCount: number;
    progress: ApplyProgress;
  }>;
};
