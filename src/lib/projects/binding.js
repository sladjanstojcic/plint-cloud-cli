export const REDACTED = '[redacted]';

export function redactBinding(binding, { reveal } = {}) {
  if (reveal || !binding?.zone_password) return binding;
  return { ...binding, zone_password: REDACTED };
}
