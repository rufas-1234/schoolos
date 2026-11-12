const subjectCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;

export function normalizeSubjectCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSubjectCode(value: string): boolean {
  return subjectCodePattern.test(normalizeSubjectCode(value));
}
