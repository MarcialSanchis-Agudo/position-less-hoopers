// Translate the CommandAgent envelope to the narrower host-owned JSON protocol.
// Do not rewrite tool paths or weaken executeOllamaWorkspaceTool's checks.
export const JSON_ACTION_PATH_CONTRACT_VERSION = "workspace-relative-v0.1.2";

export const JSON_ACTION_PATH_RULES = [
  "All action path arguments are RELATIVE to the assigned workspace root, which is '.'.",
  "Use the relative paths printed in the task verbatim. Do not prepend a host directory or 'workspace/'.",
  'To inspect the root, use {"action":"list_directory","path":"."}.',
  'To read the task, use {"action":"read_text_file","path":"TASK.md"}.',
  "Absolute paths, home-directory prefixes, drive prefixes, and parent traversal are not allowed.",
  "Never derive a workspace path from an execution/result/log location.",
  "If an action is rejected for its path, do not repeat it; list_directory with path '.' discovers the permitted root.",
  "The adapter, not you, reads execution metadata and writes the execution result outside the workspace.",
  "Do not locate, read, or write execution-request.json, agent-instructions.md, or execution-result.json.",
  "When done, use finish with a summary; do not write a completion file."
].join("\n");

export function buildJsonActionWorkspacePrompt(instructions, resultPath) {
  if (typeof instructions !== "string" || !instructions.trim()) {
    throw new TypeError("instructions must be a non-empty string");
  }
  if (typeof resultPath !== "string" || !resultPath.trim()) {
    throw new TypeError("resultPath must be a non-empty string");
  }
  let body = instructions.trimEnd();
  if (body.startsWith("# PLH Execution Assignment\n")) {
    // Match the exact host-generated footer, not arbitrary task text or paths.
    const footer = [
      "", "## Completion protocol",
      `Before exiting, write a valid PLH ExecutionResult JSON object to: ${resultPath}`,
      "", "Allowed status values: completed, blocked, failed.",
      "Do not claim evidence that was not actually produced."
    ].join("\n");
    const authority = "## Authority\nYour allowed execution authority is encoded in execution-request.json.";
    if (!body.endsWith(footer)) {
      throw new Error("Unrecognized CommandAgent completion envelope; refusing to forward host instructions");
    }
    body = body.slice(0, -footer.length);
    const authorityAt = body.lastIndexOf(authority);
    if (authorityAt < 0) {
      throw new Error("Unrecognized CommandAgent authority envelope");
    }
    body = body.slice(0, authorityAt) +
      "## Authority\nWork only inside the assigned workspace. The adapter owns execution metadata and completion reporting." +
      body.slice(authorityAt + authority.length);
  }
  return [
    "## Workspace path contract", JSON_ACTION_PATH_RULES, "", body.trimEnd(), "",
    "## Structured JSON-action runtime rules", "",
    "- This runtime does not expose native Ollama tools.",
    "- Choose one host-executed JSON action at a time.",
    "- For existing implementation files, read with line numbers and prefer replace_line_range.",
    "- Do not overwrite existing implementation files with write_text_file.",
    "- Run public tests after coherent changes.",
    "- A green public test is useful but authoritative external evidence remains owned by the PLH harness.",
    "- Finish when the requested contract work has been addressed and public tests have been checked."
  ].join("\n");
}
