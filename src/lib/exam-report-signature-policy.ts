export function isDeputyHeadteacherJobTitle(jobTitle: string | null): boolean {
  const normalized = (jobTitle ?? "").toLocaleLowerCase().replace(/[^a-z]+/g, " ").trim();
  return normalized.includes("deputy head");
}
