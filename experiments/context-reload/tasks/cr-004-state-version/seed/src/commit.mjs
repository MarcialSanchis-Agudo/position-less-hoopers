import { versionMatches } from "./state.mjs";

export function canCommit(proposal, state) {
  return proposal.approved === true &&
    versionMatches(proposal.workspaceVersionSeen, state.workspaceVersion);
}

