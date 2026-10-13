import fs from "node:fs/promises";
import path from "node:path";

const runArg = process.argv[2];
const evalArg = process.argv[3];

if (!runArg || !evalArg) {
  process.stderr.write(
    "usage: node summarize-local-frontier-edits.mjs <runDir> <evalSet.json>\n"
  );
  process.exit(2);
}

const root = process.cwd();
const runRoot = path.resolve(root, runArg);
const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalArg), "utf8")
);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const taskPackById = new Map();

for (const entry of evalSet.prospectiveTaskPacks ?? []) {
  const manifestPath = path.resolve(root, entry.taskPack);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  );
  taskPackById.set(manifest.taskPackId, {
    manifest,
    packRoot: path.dirname(manifestPath),
    profile: evalSet.taskProfiles?.[manifest.taskPackId]
  });
}

const files = await walk(path.join(runRoot, "cells"));
const cellFiles = files.filter((file) =>
  file.endsWith("ontology-stress-cell-result.json")
);

const rows = [];

for (const cellFile of cellFiles) {
  const cell = JSON.parse(await fs.readFile(cellFile, "utf8"));
  const task = taskPackById.get(cell.taskPackId);
  if (!task?.profile?.implementationPath) continue;

  const workspace = path.join(path.dirname(cellFile), "workspace");
  const finalPath = path.join(
    workspace,
    task.profile.implementationPath
  );
  const seedPath = path.join(
    task.packRoot,
    task.manifest.seedPath,
    task.profile.implementationPath
  );

  const targetVersion =
    cell?.final?.grade?.contractVersion ?? null;

  const preActionPath =
    cell?.initialPreparation?.referenceApplied === true &&
    typeof cell?.initialPreparation?.referenceSource === "string"
      ? path.join(
          task.packRoot,
          cell.initialPreparation.referenceSource
        )
      : seedPath;

  const referencePath =
    targetVersion == null
      ? null
      : path.join(
          task.packRoot,
          task.profile.referenceSolutionPattern.replace(
            "{version}",
            String(targetVersion)
          )
        );

  const [finalText, seedText, preActionText, referenceText] =
    await Promise.all([
      fs.readFile(finalPath, "utf8"),
      fs.readFile(seedPath, "utf8"),
      fs.readFile(preActionPath, "utf8"),
      referencePath == null
        ? Promise.resolve(null)
        : fs.readFile(referencePath, "utf8")
    ]);

  rows.push({
    taskPackId: cell.taskPackId,
    scenarioId: cell.scenarioId,
    scenarioClass: cell.scenarioClass,
    baselineId: cell.baselineId,
    targetVersion,
    selectedWorkerId:
      cell?.coordination?.selectedWorkerId ?? null,
    contextKinds:
      cell?.coordination?.contextKinds ?? [],
    preActionSource:
      path.relative(task.packRoot, preActionPath)
        .split(path.sep)
        .join("/"),
    finalEqualsPreAction:
      finalText === preActionText,
    finalEqualsSeed: finalText === seedText,
    finalEqualsReference:
      referenceText == null
        ? null
        : finalText === referenceText,
    finalLength: finalText.length,
    preActionLength: preActionText.length,
    seedLength: seedText.length,
    referenceLength:
      referenceText == null ? null : referenceText.length
  });
}

function count(predicate) {
  return rows.filter(predicate).length;
}

const summary = {
  schemaVersion: 1,
  runDir: runArg,
  runCount: rows.length,
  finalEqualsPreActionCount:
    count((row) => row.finalEqualsPreAction),
  finalChangedFromPreActionCount:
    count((row) => !row.finalEqualsPreAction),
  finalEqualsSeedCount: count((row) => row.finalEqualsSeed),
  finalChangedFromSeedCount: count((row) => !row.finalEqualsSeed),
  finalEqualsReferenceCount: count(
    (row) => row.finalEqualsReference === true
  ),
  byBaseline: Object.fromEntries(
    [...new Set(rows.map((row) => row.baselineId))]
      .sort()
      .map((baselineId) => {
        const subset = rows.filter(
          (row) => row.baselineId === baselineId
        );
        return [
          baselineId,
          {
            runCount: subset.length,
            finalEqualsPreActionCount:
              subset.filter(
                (row) => row.finalEqualsPreAction
              ).length,
            finalChangedFromPreActionCount:
              subset.filter(
                (row) => !row.finalEqualsPreAction
              ).length,
            finalEqualsSeedCount:
              subset.filter((row) => row.finalEqualsSeed).length,
            finalChangedFromSeedCount:
              subset.filter((row) => !row.finalEqualsSeed).length,
            finalEqualsReferenceCount:
              subset.filter(
                (row) => row.finalEqualsReference === true
              ).length
          }
        ];
      })
  ),
  records: rows
};

const outputPath = path.join(
  runRoot,
  "local-frontier-edit-diagnostics.json"
);
await fs.writeFile(
  outputPath,
  JSON.stringify(summary, null, 2) + "\n"
);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
