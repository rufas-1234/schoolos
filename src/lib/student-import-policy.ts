export function normalizeSectionName(value: string) {
  return value.trim().toLowerCase().replace(/^section\s+/, "");
}
