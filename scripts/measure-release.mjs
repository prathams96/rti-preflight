import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const staticChunks = join(root, ".next", "static", "chunks");
const buildIdPath = join(root, ".next", "BUILD_ID");
const routeManifestPath = join(root, ".next", "routes-manifest.json");

if (
  !existsSync(buildIdPath) ||
  !existsSync(staticChunks) ||
  !existsSync(routeManifestPath)
) {
  console.error("Production build missing. Run npm run build first.");
  process.exit(1);
}

function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

const javascriptFiles = filesIn(staticChunks).filter((path) =>
  path.endsWith(".js"),
);
if (javascriptFiles.length === 0) {
  console.error("Production build contains no JavaScript chunks.");
  process.exit(1);
}
const rawBytes = javascriptFiles.reduce(
  (total, path) => total + statSync(path).size,
  0,
);
const gzippedBytes = javascriptFiles.reduce(
  (total, path) => total + gzipSync(readFileSync(path), { level: 9 }).length,
  0,
);
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
})();

const report = {
  generatedAt: new Date().toISOString(),
  commit,
  buildId: readFileSync(buildIdPath, "utf8").trim(),
  routeManifest: relative(root, routeManifestPath),
  askRoute: {
    javascriptFiles: javascriptFiles.map((path) => relative(root, path)),
    rawBytes,
    gzippedBytes,
    budgetBytes: 200 * 1024,
    budgetStatus: gzippedBytes <= 200 * 1024 ? "pass" : "review-required",
    method:
      "sum of every production JavaScript chunk under .next/static/chunks, gzip level 9",
  },
  limitations: [
    "This is a conservative upper bound, not a route-specific load graph.",
    "Cold 3G FCP and cached p50/p95 timings require a browser run against the deployed build.",
  ],
};

const output = JSON.stringify(report, null, 2);
console.log(output);
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
  writeFileSync(resolve(root, process.argv[outputIndex + 1]), `${output}\n`);
}
