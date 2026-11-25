export type GeneratedChartAccountType = "asset" | "income" | "expense";

const generatedCodeRanges: Record<GeneratedChartAccountType, readonly [number, number]> = {
  asset: [1100, 1999],
  income: [4200, 4999],
  expense: [5600, 5999],
};

export function nextGeneratedChartAccountCode(
  accountType: GeneratedChartAccountType,
  existingCodes: readonly string[],
): string | null {
  const [start, end] = generatedCodeRanges[accountType];
  const usedCodes = new Set(existingCodes);
  for (let code = start; code <= end; code += 1) {
    const candidate = String(code);
    if (!usedCodes.has(candidate)) return candidate;
  }
  return null;
}
