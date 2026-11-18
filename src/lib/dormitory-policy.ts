export type DormitoryGenderPolicy = "male" | "female" | "mixed";

export function isDormitoryGenderCompatible(
  policy: DormitoryGenderPolicy,
  studentGender: string | null,
): boolean {
  if (policy === "mixed") return true;
  return studentGender === policy;
}

export function hasDormitoryCapacity(capacity: number, occupiedBeds: number): boolean {
  return Number.isInteger(capacity) && capacity > 0 &&
    Number.isInteger(occupiedBeds) && occupiedBeds >= 0 && occupiedBeds < capacity;
}

export function hasDormitoryBatchCapacity(
  capacity: number,
  occupiedBeds: number,
  requestedBeds: number,
): boolean {
  return Number.isInteger(capacity) && capacity > 0 &&
    Number.isInteger(occupiedBeds) && occupiedBeds >= 0 &&
    Number.isInteger(requestedBeds) && requestedBeds > 0 &&
    occupiedBeds + requestedBeds <= capacity;
}
