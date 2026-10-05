import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const runRootArg = process.argv[2];
const sourceRel = process.argv[3];
const destinationRel = process.argv[4];

if (!runRootArg || !sourceRel || !destinationRel) {
  process.stderr.write(
    "usage: node apply-task-pack-reference.mjs <runRoot> <referenceSource> <workspaceDestination>\n"
  );
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const source = path.resolve(root, sourceRel);
const destination = path.join(runRoot, "workspace", destinationRel);

await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.copyFile(source, destination);

process.stdout.write(JSON.stringify({
  applied: true,
  destination: path.relative(root, destination).split(path.sep).join("/")
}) + "\n");

