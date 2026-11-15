export type RankedWorkspaceSearchResult = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: string;
  searchTerms?: string[];
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");
}

function editDistance(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[second.length];
}

function termScore(queryTerm: string, candidate: string): number {
  if (candidate === queryTerm) return 1;
  if (candidate.startsWith(queryTerm) || queryTerm.startsWith(candidate)) return 0.88;
  if (candidate.includes(queryTerm) || queryTerm.includes(candidate)) return 0.82;
  if (Math.min(queryTerm.length, candidate.length) < 3) return 0;
  return 1 - editDistance(queryTerm, candidate) / Math.max(queryTerm.length, candidate.length);
}

export function getFuzzySearchNgrams(queryTerms: string[]): string[] {
  const grams = new Set<string>();
  for (const token of queryTerms.slice(0, 8)) {
    if (token.length < 3) continue;
    const pairCount = token.length - 1;
    const step = Math.max(1, Math.ceil(pairCount / 8));
    for (let index = 0; index < pairCount && grams.size < 64; index += step) {
      grams.add(token.slice(index, index + 2));
    }
  }
  return [...grams];
}

function resultScore(query: string, result: RankedWorkspaceSearchResult): number {
  const normalizedQuery = normalize(query).trim();
  const content = normalize(`${result.title} ${result.description} ${(result.searchTerms ?? []).join(" ")}`);
  if (!normalizedQuery || !content) return 0;
  if (content.includes(normalizedQuery)) return 1;

  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  const contentTerms = content.split(/\s+/).filter(Boolean);
  if (!queryTerms.length || !contentTerms.length) return 0;
  const scores = queryTerms.map((queryTerm) =>
    Math.max(...contentTerms.map((candidate) => termScore(queryTerm, candidate))),
  );
  if (scores.some((score) => score < 0.62)) return 0;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

export function rankWorkspaceSearchResults<T extends RankedWorkspaceSearchResult>(
  query: string,
  results: T[],
  limit = 20,
): T[] {
  return results
    .map((result, index) => ({ result, index, score: resultScore(query, result) }))
    .filter((entry) => entry.score >= 0.62)
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .slice(0, limit)
    .map(({ result }) => result);
}
