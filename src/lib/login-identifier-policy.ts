export function normalizePhoneIdentifier(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(normalized) ? normalized : "";
}

export function normalizeAdmissionIdentifier(value: string) {
  const normalized = value.trim().toLocaleUpperCase();
  return normalized.length > 0 && normalized.length <= 40 ? normalized : "";
}
