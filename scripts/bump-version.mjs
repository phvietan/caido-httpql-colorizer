import fs from "node:fs";

const packagePath = "package.json";
const configPath = "caido.config.ts";

const packageText = fs.readFileSync(packagePath, "utf8");
const configText = fs.readFileSync(configPath, "utf8");
const packageJson = JSON.parse(packageText);
const configMatch = configText.match(/version:\s*["'](\d+)\.(\d+)\.(\d+)["']/);

if (!configMatch) {
  throw new Error("Could not find a semantic version in caido.config.ts");
}

const packageVersion = packageJson.version;
const configVersion = configMatch.slice(1).join(".");

if (packageVersion !== configVersion) {
  throw new Error(`Version mismatch: package.json=${packageVersion}, caido.config.ts=${configVersion}`);
}

const versionMatch = packageVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!versionMatch) {
  throw new Error(`Unsupported package version: ${packageVersion}`);
}

const nextVersion = `${versionMatch[1]}.${versionMatch[2]}.${Number(versionMatch[3]) + 1}`;
const updatedPackage = packageText.replace(
  /(\"version\"\s*:\s*\")(\d+\.\d+\.\d+)(\")/,
  `$1${nextVersion}$3`,
);
const updatedConfig = configText.replace(
  /(version:\s*["'])(\d+\.\d+\.\d+)(["'])/,
  `$1${nextVersion}$3`,
);

fs.writeFileSync(packagePath, updatedPackage);
fs.writeFileSync(configPath, updatedConfig);
console.log(nextVersion);
