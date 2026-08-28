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
const askHtmlPath = join(root, ".next", "server", "app", "index.html");

if (
  !existsSync(buildIdPath) ||
  !existsSync(staticChunks) ||
  !existsSync(routeManifestPath) ||
  !existsSync(askHtmlPath)
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

const allJavascriptFiles = filesIn(staticChunks).filter((path) =>
  path.endsWith(".js"),
);
if (allJavascriptFiles.length === 0) {
  console.error("Production build contains no JavaScript chunks.");
  process.exit(1);
}

function measure(files) {
  return {
    javascriptFiles: files.map((path) => relative(root, path)),
    rawBytes: files.reduce((total, path) => total + statSync(path).size, 0),
    gzippedBytes: files.reduce(
      (total, path) =>
        total + gzipSync(readFileSync(path), { level: 9 }).length,
      0,
    ),
  };
}

function initialScriptsFromHtml(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  const paths = scripts.flatMap(([, attributes]) => {
    if (/\bnomodule\b/i.test(attributes)) return [];
    const source = attributes.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!source) return [];
    const url = new URL(source, "http://localhost");
    const prefix = "/_next/static/chunks/";
    if (!url.pathname.startsWith(prefix)) return [];
    return [join(staticChunks, url.pathname.slice(prefix.length))];
  });
  return [...new Set(paths)].filter((path) => existsSync(path));
}

const initialJavascriptFiles = initialScriptsFromHtml(
  readFileSync(askHtmlPath, "utf8"),
);
if (initialJavascriptFiles.length === 0) {
  console.error("Production build contains no initial Ask-route scripts.");
  process.exit(1);
}
const deferredJavascriptFiles = allJavascriptFiles.filter(
  (path) => !initialJavascriptFiles.includes(path),
);
const initial = measure(initialJavascriptFiles);
const deferred = measure(deferredJavascriptFiles);
const pdfDeferredJavascriptFiles = deferredJavascriptFiles.filter((path) =>
  /pdf-lib|fontkit/i.test(readFileSync(path, "utf8")),
);
const pdfDeferred = measure(pdfDeferredJavascriptFiles);
const initialSources = initialJavascriptFiles.map((path) =>
  readFileSync(path, "utf8"),
);
const initialContainsPdfDependencies = initialSources.some((source) =>
  /pdf-lib|fontkit|noto-sans-combined/i.test(source),
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
    javascriptFiles: initial.javascriptFiles,
    rawBytes: initial.rawBytes,
    gzippedBytes: initial.gzippedBytes,
    budgetBytes: 200 * 1024,
    budgetStatus:
      initial.gzippedBytes <= 200 * 1024 ? "pass" : "review-required",
    method:
      "sum of JavaScript chunks referenced by the built Ask-route HTML, excluding noModule legacy polyfills, gzip level 9",
    initialContainsPdfDependencies,
  },
  deferred: {
    javascriptFiles: deferred.javascriptFiles,
    rawBytes: deferred.rawBytes,
    gzippedBytes: deferred.gzippedBytes,
  },
  deferredPdf: {
    javascriptFiles: pdfDeferred.javascriptFiles,
    rawBytes: pdfDeferred.rawBytes,
    gzippedBytes: pdfDeferred.gzippedBytes,
    method:
      "deferred JavaScript chunks containing pdf-lib or fontkit, gzip level 9",
  },
  limitations: [
    "The initial budget follows scripts present in the built Ask-route HTML for modern browsers; deferred feature chunks are reported separately.",
    "Cold 3G FCP and cached p50/p95 timings require a browser run against the deployed build.",
  ],
};

const output = JSON.stringify(report, null, 2);
console.log(output);
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
  writeFileSync(resolve(root, process.argv[outputIndex + 1]), `${output}\n`);
}
