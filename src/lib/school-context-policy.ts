export type SchoolChoice = {
  schoolPublicId: string;
};

export const activeSchoolCookieName = "schoolos_active_school";

export function isMultiSchoolEnabled() {
  return process.env.MULTI_SCHOOL_ENABLED?.trim().toLowerCase() !== "false";
}

export function resolveSchoolChoice<T extends SchoolChoice>(
  choices: T[],
  selectedSchoolPublicId: string | undefined,
  multiSchoolEnabled: boolean,
  defaultSchoolPublicId?: string,
): T | null {
  if (!choices.length) return null;

  if (!multiSchoolEnabled) {
    if (defaultSchoolPublicId) {
      return choices.find((choice) => choice.schoolPublicId === defaultSchoolPublicId) ?? null;
    }
    return choices.find((choice) => choice.schoolPublicId === selectedSchoolPublicId) ?? choices[0];
  }

  if (choices.length === 1) return choices[0];
  return choices.find((choice) => choice.schoolPublicId === selectedSchoolPublicId) ?? null;
}
