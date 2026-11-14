export function canEditRole(isSystem: boolean, assignedAccountCount: number): boolean {
  return !isSystem || assignedAccountCount === 0;
}
