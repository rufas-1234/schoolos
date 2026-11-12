export function normalizeStudentCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidStudentCategoryName(value: string): boolean {
  const normalized = normalizeStudentCategoryName(value);
  return normalized.length > 0 && normalized.length <= 120;
}
