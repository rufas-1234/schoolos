export type BranchSelectionOption = {
  id: number;
  name?: string;
  label?: string;
  code?: string;
};

export function getDefaultBranchId(branches: readonly BranchSelectionOption[]): number | null {
  const mainBranch = branches.find((branch) =>
    /\bmain\b/i.test(`${branch.name ?? branch.label ?? ""} ${branch.code ?? ""}`),
  );
  return mainBranch?.id ?? branches[0]?.id ?? null;
}

export function resolveBranchFilterId(
  branches: readonly BranchSelectionOption[],
  requestedValue: string | undefined,
): number | null {
  if (requestedValue === "") return null;
  if (requestedValue !== undefined && /^\d+$/.test(requestedValue)) {
    const requestedId = Number(requestedValue);
    if (Number.isSafeInteger(requestedId) && branches.some((branch) => branch.id === requestedId)) {
      return requestedId;
    }
  }
  return getDefaultBranchId(branches);
}

export function getDefaultBranchFilterValue(
  options: readonly { value: string; label: string }[],
): string {
  const mainBranch = options.find((option) => /\bmain\b/i.test(option.label));
  if (mainBranch) return mainBranch.value;
  return options.find((option) => !/unassigned|no branch/i.test(option.label))?.value ?? "";
}
