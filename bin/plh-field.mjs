#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { buildCoordinationField, summarizeCoordinationField } from "../src/index.mjs";

function usage() {
  return [
    "Usage:",
    "  plh-field <snapshot.json> [--metrics]",
    "  cat snapshot.json | plh-field - [--metrics]",
    "",
    "The input is a P0 snapshot object accepted by buildCoordinationField()."
  ].join("\n");
}

async function readInput(path) {
  if (path === "-") {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data;
  }
  return fs.readFile(path, "utf8");
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(usage() + "\n");
  process.exit(args.length === 0 ? 1 : 0);
}

const metrics = args.includes("--metrics");
const path = args.find((arg) => !arg.startsWith("--"));

try {
  const source = await readInput(path);
  const input = JSON.parse(source);
  const field = buildCoordinationField(input, {
    observedAt: input.observedAt ?? new Date().toISOString()
  });
  const output = metrics
    ? { field, metrics: summarizeCoordinationField(field) }
    : field;
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(2);
}

