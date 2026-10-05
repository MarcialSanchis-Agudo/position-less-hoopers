export function canAdmit({ limit, spent, reserved, requested }) {
  if ([limit, spent, reserved, requested].some((value) => value < 0)) return false;
  return spent + requested <= limit;
}

