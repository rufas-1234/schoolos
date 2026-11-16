import { gradeForPercentage, type GradeBand } from "./examination-policy";

export type ExamAnalyticsSummary = {
  count: number;
  mean: number | null;
  median: number | null;
  highest: number | null;
  lowest: number | null;
};

export function summarizeExamScores(scores: number[]): ExamAnalyticsSummary {
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error("Exam analytics scores must be percentages between 0 and 100.");
  }
  if (!scores.length) return { count: 0, mean: null, median: null, highest: null, lowest: null };
  const sorted = [...scores].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return {
    count: scores.length,
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    median,
    highest: sorted[sorted.length - 1],
    lowest: sorted[0],
  };
}

export function gradeDistribution(
  scores: number[],
  bands: GradeBand[],
): Array<{ grade: string; description: string; count: number }> {
  const distribution = bands.map((band) => ({
    grade: band.grade,
    description: band.description,
    count: 0,
  }));
  for (const score of scores) {
    const band = gradeForPercentage(score, bands);
    if (!band) continue;
    const entry = distribution.find((item) => item.grade === band.grade);
    if (!entry) throw new Error("A grade band could not be matched to the selected scale.");
    entry.count += 1;
  }
  return distribution;
}

export function analyticsRank(scores: Array<{ id: number; score: number }>): Map<number, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.id - b.id);
  const ranks = new Map<number, number>();
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (index === 0 || entry.score !== sorted[index - 1].score) rank = index + 1;
    ranks.set(entry.id, rank);
  });
  return ranks;
}

export function analyzeSubjectLearners(
  scores: Array<{ id: number; percentage: number }>,
  bands: GradeBand[],
  allowRanking: boolean,
): Map<number, { grade: string | null; rank: number | null }> {
  const ranks = allowRanking
    ? analyticsRank(scores.map((entry) => ({ id: entry.id, score: entry.percentage })))
    : new Map<number, number>();
  return new Map(scores.map((entry) => [
    entry.id,
    {
      grade: gradeForPercentage(entry.percentage, bands)?.grade ?? null,
      rank: ranks.get(entry.id) ?? null,
    },
  ]));
}
