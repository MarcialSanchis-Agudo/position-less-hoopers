import fs from "node:fs/promises";

const requestPath = process.env.PLH_EXECUTION_REQUEST;
const resultPath = process.env.PLH_EXECUTION_RESULT;

if (!requestPath || !resultPath) {
  process.exit(2);
}

const request = JSON.parse(await fs.readFile(requestPath, "utf8"));

await fs.writeFile(
  resultPath,
  JSON.stringify({
    schemaVersion: 1,
    requestId: request.requestId,
    status: "completed",
    evidenceRefs: request.expectedEvidenceRefs,
    summary: "Claiming completion without changing the workspace"
  }, null, 2) + "\n"
);

process.stdout.write("claim-only-agent declared completion\n");

