import type { ApplyResult } from "./index";

export function normalizeHex(value: string): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate)
    ? candidate.toUpperCase()
    : "#185A6C";
}

export function colorsEqual(current: string | null, desired: string): boolean {
  return String(current ?? "").toUpperCase() === desired.toUpperCase();
}

export function cancelledResult(
  cleared = 0,
  errors: string[] = [],
  colored = 0,
): ApplyResult {
  return { colored, cleared, errors: errors.slice(0, 20), cancelled: true };
}
