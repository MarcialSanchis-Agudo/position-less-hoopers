export function eligible(candidate) {
  return candidate.disabled !== true;
}

export function exactMatch(candidate, requiredCapability) {
  return candidate.capabilities?.includes(requiredCapability) === true;
}

