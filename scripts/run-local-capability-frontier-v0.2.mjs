import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildLocalModelLock,
  validateLocalModelLock
} from "../src/local-model-lock.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const evalSetArg = process.argv[2];
const ontologyArg = process.argv[3];
const outArg = process.argv[4];
const adapterArg = process.argv[5];
const repeatsArg = process.argv[6] ?? null;
const maxCellsArg = process.argv[7] ?? null;

if (!evalSetArg || !ontologyArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-local-capability-frontier-v0.2.mjs <eval-set.json> <ontology.json> <outDir> <adapter.json> [repeats] [maxCells]\n"
  );
  process.exit(2);
}

const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalSetArg), "utf8")
);
const repeats = repeatsArg == null
  ? Number(evalSet.analysisPlan?.minimumReplicatesPerTaskCondition ?? 5)
  : Number(repeatsArg);

const expectedLock = buildLocalModelLock({
  model: process.env.PLH_LOCAL_MODEL,
  localProvider: process.env.PLH_LOCAL_PROVIDER || "ollama",
  evalSetArg,
  ontologyArg,
  adapterArg,
  repeats
});

const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (
  !relativeOut ||
  relativeOut.startsWith("..") ||
  path.isAbsolute(relativeOut)
) {
  throw new Error("output directory must stay inside repository");
}
await fs.mkdir(outRoot, { recursive: true });

const lockPath = path.join(outRoot, "local-model-lock.json");
let existingLock = null;
try {
  existingLock = JSON.parse(await fs.readFile(lockPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (existingLock == null) {
  await fs.writeFile(
    lockPath,
    JSON.stringify(expectedLock, null, 2) + "\n"
  );
} else {
  validateLocalModelLock(existingLock, expectedLock);
}

const runner = path.join(
  root,
  "scripts/run-ontology-stress-matrix-v0.3.2.mjs"
);
const forwarded = [evalSetArg, ontologyArg, outArg, adapterArg];
if (repeatsArg != null) forwarded.push(repeatsArg);
if (maxCellsArg != null) forwarded.push(maxCellsArg);

const proc = spawnSync(
  process.execPath,
  [runner, ...forwarded],
  {
    cwd: root,
    env: process.env,
    encoding: "utf8"
  }
);

if (proc.stdout) process.stdout.write(proc.stdout);
if (proc.stderr) process.stderr.write(proc.stderr);

try {
  const matrixSummary = JSON.parse(
    await fs.readFile(
      path.join(outRoot, "ontology-stress-matrix-summary.json"),
      "utf8"
    )
  );
  await fs.writeFile(
    path.join(outRoot, "local-capability-frontier-summary.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        localModelLock: expectedLock,
        matrixSummary
      },
      null,
      2
    ) + "\n"
  );
} catch {}

process.exit(proc.status ?? 1);
