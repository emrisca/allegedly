#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.argv[2] || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const REQUIRED_UI_SDK_VERSION = "0.1.0-beta.17";
const BANNED_PACKAGES = new Set([
  "dockview-enterprise",
  "@dockview/enterprise",
  "charting_library",
  "hqchart",
]);

function walkPackageJsons(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "target" || entry.name === "spikes") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPackageJsons(full, out);
    } else if (entry.name === "package.json") {
      out.push(full);
    }
  }
  return out;
}

const pkgFiles = walkPackageJsons(repoRoot);
let failures = 0;

for (const file of pkgFiles) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const sec of sections) {
    const deps = pkg[sec] || {};
    for (const [name, ver] of Object.entries(deps)) {
      if (BANNED_PACKAGES.has(name)) {
        console.error(`FAIL [SC-02]: Banned package "${name}" found in ${path.relative(repoRoot, file)} (${sec})`);
        failures++;
      }
      if ((name === "@ui-sdk/react" || name === "@ui-sdk/core") && ver !== REQUIRED_UI_SDK_VERSION) {
        console.error(`FAIL [AGENTS.md]: ${name} in ${path.relative(repoRoot, file)} must be exact pin "${REQUIRED_UI_SDK_VERSION}", found "${ver}"`);
        failures++;
      }
    }
  }
}

if (failures > 0) {
  process.exit(1);
}
console.log(`PASS [SC-02/AGENTS.md]: Checked ${pkgFiles.length} package.json file(s); 0 banned packages, exact @ui-sdk pins verified.`);
