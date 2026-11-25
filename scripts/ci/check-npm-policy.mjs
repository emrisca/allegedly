#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot =
  process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const REQUIRED_EXACT_PINS = new Map([
  ["@ui-sdk/react", "0.1.0-beta.17"],
  ["@ui-sdk/core", "0.1.0-beta.17"],
  ["dockview", "8.9.1"],
  ["lightweight-charts", "5.3.0"],
]);

const BANNED_PACKAGES = new Set([
  "dockview-enterprise",
  "@dockview/enterprise",
  "charting_library",
  "hqchart",
]);

function walkPackageJsons(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "target" ||
      entry.name === "spikes"
    ) {
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
        console.error(
          `FAIL [SC-02]: Banned package "${name}" found in ${path.relative(repoRoot, file)} (${sec})`,
        );
        failures++;
      }
      const requiredVer = REQUIRED_EXACT_PINS.get(name);
      if (requiredVer && ver !== requiredVer) {
        console.error(
          `FAIL [AGENTS.md]: ${name} in ${path.relative(repoRoot, file)} must be exact pin "${requiredVer}", found "${ver}"`,
        );
        failures++;
      }
    }
  }
}

// Scan pnpm-lock.yaml for banned transitive/direct packages and verify resolved exact pins
const lockPath = path.join(repoRoot, "pnpm-lock.yaml");
if (!fs.existsSync(lockPath)) {
  console.error("FAIL [SC-02]: pnpm-lock.yaml is missing at repo root");
  failures++;
} else {
  const lockText = fs.readFileSync(lockPath, "utf8");
  for (const banned of BANNED_PACKAGES) {
    const re = new RegExp(`(^|[\s'"/])${banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(@|:|'|"|\s|$)`, "m");
    if (re.test(lockText)) {
      console.error(`FAIL [SC-02]: Banned package "${banned}" referenced in pnpm-lock.yaml`);
      failures++;
    }
  }
  for (const [pkgName, expectedVer] of REQUIRED_EXACT_PINS.entries()) {
    const exactEntry = `${pkgName}@${expectedVer}`;
    if (!lockText.includes(exactEntry)) {
      console.error(
        `FAIL [AGENTS.md]: Expected exact resolved package "${exactEntry}" not found in pnpm-lock.yaml`,
      );
      failures++;
    }
  }
}

if (failures > 0) {
  process.exit(1);
}
console.log(
  `PASS [SC-02/AGENTS.md]: Checked ${pkgFiles.length} package.json file(s) + pnpm-lock.yaml; 0 banned packages, exact pins (@ui-sdk 0.1.0-beta.17, dockview 8.9.1, lightweight-charts 5.3.0) verified.`,
);
