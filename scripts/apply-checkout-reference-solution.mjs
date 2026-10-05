import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runRootArg = process.argv[2];

if (!runRootArg) {
  process.stderr.write("usage: node apply-checkout-reference-solution.mjs <runRoot>\n");
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const workspace = path.join(runRoot, "workspace");
const source = path.join(
  root,
  "examples/checkout-incident/reference-solution/checkout.mjs"
);

await fs.copyFile(source, path.join(workspace, "src/checkout.mjs"));

process.stdout.write(JSON.stringify({
  applied: true,
  runRoot: path.relative(root, runRoot).split(path.sep).join("/")
}) + "\n");

