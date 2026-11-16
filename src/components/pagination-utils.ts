export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;

export function parsePageSize(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return PAGE_SIZE_OPTIONS.find((option) => option === parsed) ?? DEFAULT_PAGE_SIZE;
}
