import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeContextReloadExperiment } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const resultsPath = process.argv[2] ?? "results/local/context-reload/runs.json";
const abs = path.resolve(root, resultsPath);
const runs = JSON.parse(await fs.readFile(abs, "utf8"));
const summary = summarizeContextReloadExperiment(runs);

const output = path.join(path.dirname(abs), "summary.json");
await fs.writeFile(output, JSON.stringify(summary, null, 2) + "\n", "utf8");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

