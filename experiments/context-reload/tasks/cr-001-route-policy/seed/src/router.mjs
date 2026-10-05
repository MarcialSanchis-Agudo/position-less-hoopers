import { eligible, exactMatch } from "./policies.mjs";

export function chooseRoute(candidates, requiredCapability) {
  const usable = candidates.filter(eligible);
  const exact = usable.filter((candidate) => exactMatch(candidate, requiredCapability));
  const fallback = usable.filter((candidate) => candidate.fallback === true);

  const pool = [...fallback, ...exact];
  return pool[0]?.id ?? null;
}

