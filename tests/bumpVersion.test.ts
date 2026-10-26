import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, onTestFinished } from "vitest";

const script = fileURLToPath(new URL("../scripts/bump-version.mjs", import.meta.url));

function fixture(packageVersion: string, configVersion: string) {
  const cwd = mkdtempSync(path.join(tmpdir(), "colorizer-version-"));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "test-plugin", version: packageVersion }));
  writeFileSync(path.join(cwd, "caido.config.ts"), `export default { version: "${configVersion}" };`);
  return {
    read: (file) => readFileSync(path.join(cwd, file), "utf8"),
    run: () => execFileSync(process.execPath, [script], { cwd, encoding: "utf8", stdio: "pipe" }),
  };
}

test("release version bump updates both files and crosses patch digit boundaries", () => {
  const files = fixture("1.0.9", "1.0.9");
  assert.equal(files.run().trim(), "1.0.10");
  assert.deepEqual(JSON.parse(files.read("package.json")), { name: "test-plugin", version: "1.0.10" });
  assert.equal(files.read("caido.config.ts"), 'export default { version: "1.0.10" };');
});

test("release version bump rejects mismatches without changing either file", () => {
  const files = fixture("1.0.9", "1.0.8");
  const original = [files.read("package.json"), files.read("caido.config.ts")];
  assert.throws(files.run, /Version mismatch/);
  assert.deepEqual([files.read("package.json"), files.read("caido.config.ts")], original);
});

test("release version bump rejects an invalid config version without changing either file", () => {
  const files = fixture("1.0.9", "invalid");
  const original = [files.read("package.json"), files.read("caido.config.ts")];
  assert.throws(files.run, /Could not find a semantic version/);
  assert.deepEqual([files.read("package.json"), files.read("caido.config.ts")], original);
});
