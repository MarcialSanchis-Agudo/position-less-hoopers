import fs from "node:fs/promises";
import path from "node:path";

const requestPath=process.env.PLH_EXECUTION_REQUEST;
const resultPath=process.env.PLH_EXECUTION_RESULT;
const runRoot=process.env.PLH_RUN_ROOT;
const request=JSON.parse(await fs.readFile(requestPath,"utf8"));

await fs.writeFile(
  resultPath,
  JSON.stringify({
    schemaVersion:1,
    requestId:request.requestId,
    status:"failed",
    evidenceRefs:[],
    summary:"Synthetic OpenAI/Codex infrastructure failure.",
    retryable:true
  },null,2)+"\n"
);

await fs.writeFile(
  path.join(runRoot,"provider-wrapper-telemetry.json"),
  JSON.stringify({
    schemaVersion:1,
    provider:"OpenAI",
    cli:"Codex CLI",
    cliVersion:"test",
    authMode:"chatgpt-account",
    requestedModel:"gpt-5.6-terra",
    requestedEffort:"medium",
    freshSession:true,
    durationMs:2100,
    agentExitCode:1,
    agentSignal:null,
    agentStdout:"",
    agentStderr:"",
    publicTestExitCode:0,
    publicTestStdout:"",
    publicTestStderr:""
  },null,2)+"\n"
);

process.exit(1);
