export type ExamCardEligibility = "fees-cleared" | "approved-exception" | "fees-outstanding";

export function getExamCardEligibility(
  outstandingBalanceMinor: number,
  approvedReason?: string | null,
): ExamCardEligibility {
  if (!Number.isSafeInteger(outstandingBalanceMinor) || outstandingBalanceMinor < 0) {
    throw new RangeError("Exam card balance must be a non-negative safe integer.");
  }
  if (outstandingBalanceMinor === 0) return "fees-cleared";
  if (approvedReason?.trim()) return "approved-exception";
  return "fees-outstanding";
}
