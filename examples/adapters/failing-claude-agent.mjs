import fs from "node:fs/promises";
import path from "node:path";

const requestPath=process.env.PLH_EXECUTION_REQUEST;
const resultPath=process.env.PLH_EXECUTION_RESULT;
const runRoot=process.env.PLH_RUN_ROOT;
const request=JSON.parse(await fs.readFile(requestPath,"utf8"));

await fs.writeFile(resultPath,JSON.stringify({
  schemaVersion:1,
  requestId:request.requestId,
  status:"failed",
  evidenceRefs:[],
  summary:"Synthetic executor infrastructure failure.",
  retryable:true
},null,2)+"\n");

await fs.writeFile(path.join(runRoot,"claude-wrapper-telemetry.json"),JSON.stringify({
  schemaVersion:1,
  provider:"Synthetic",
  cli:"Fake Claude",
  cliVersion:"test",
  requestedModel:"test",
  requestedEffort:"test",
  freshSession:true,
  durationMs:2100,
  claudeExitCode:1,
  claudeSignal:null,
  claudeStdout:"",
  claudeStderr:"",
  publicTestExitCode:0,
  publicTestStdout:"",
  publicTestStderr:""
},null,2)+"\n");

process.exit(1);
