export type GradeBand = {
  minPercent: number;
  maxPercent: number;
  grade: string;
  description: string;
  performanceRemark: string;
};

export function validateGradeBands(bands: GradeBand[]): string | null {
  if (bands.length === 0) return "Add at least one grade band.";
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0 || sorted[sorted.length - 1].maxPercent !== 100) {
    return "Grade bands must cover the full range from 0% to 100%.";
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index];
    if (
      !Number.isFinite(band.minPercent) ||
      !Number.isFinite(band.maxPercent) ||
      band.minPercent < 0 ||
      band.maxPercent > 100 ||
      band.minPercent >= band.maxPercent
    ) {
      return "Grade bands must use valid, increasing percentages between 0 and 100.";
    }
    if (index > 0 && sorted[index - 1].maxPercent !== band.minPercent) {
      return "Grade bands cannot overlap or leave gaps.";
    }
  }
  if (new Set(sorted.map((band) => band.grade.trim().toLocaleLowerCase())).size !== sorted.length) {
    return "Each grade letter must be unique.";
  }
  return null;
}

export function gradeForPercentage(percent: number, bands: GradeBand[]): GradeBand | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return bands.find((band) =>
    percent >= band.minPercent &&
    (percent < band.maxPercent || band.maxPercent === 100),
  ) ?? null;
}

export function calculateWeightedAverage(
  results: Array<{ marks: number; maxMarks: number; weight: number }>,
): { totalMarks: number; maxMarks: number; percentage: number } | null {
  if (
    results.length === 0 ||
    results.some((result) =>
      !Number.isFinite(result.marks) ||
      !Number.isFinite(result.maxMarks) ||
      !Number.isFinite(result.weight) ||
      result.marks < 0 ||
      result.maxMarks <= 0 ||
      result.marks > result.maxMarks ||
      result.weight <= 0,
    )
  ) {
    return null;
  }
  const weightTotal = results.reduce((sum, result) => sum + result.weight, 0);
  const percentage = results.reduce(
    (sum, result) => sum + (result.marks / result.maxMarks) * 100 * result.weight,
    0,
  ) / weightTotal;
  const maxMarks = results.reduce((sum, result) => sum + result.maxMarks, 0);
  const totalMarks = results.reduce((sum, result) => sum + result.marks, 0);
  return {
    totalMarks,
    maxMarks,
    percentage: Math.round(percentage * 100) / 100,
  };
}

export function rankScores(scores: Array<{ id: number; score: number }>): Map<number, number> {
  const ordered = [...scores].sort((a, b) => b.score - a.score || a.id - b.id);
  const ranks = new Map<number, number>();
  let rank = 0;
  ordered.forEach((entry, index) => {
    if (index === 0 || entry.score !== ordered[index - 1].score) rank = index + 1;
    ranks.set(entry.id, rank);
  });
  return ranks;
}
