/**
 * Indian mobile numbers are stored as the 10-digit national number (e.g. 9876543210) — the form
 * the apps already display — and sent to the SMS provider as +91XXXXXXXXXX.
 */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return INDIAN_MOBILE.test(digits) ? digits : null;
}

export function toIndianE164(national: string): string {
  return `+91${national}`;
}

export function maskPhone(national: string): string {
  return `+91 ${national.slice(0, 2)}******${national.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}
