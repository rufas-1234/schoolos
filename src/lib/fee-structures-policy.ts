export type FeeStructureSortBy =
  | "branch"
  | "class"
  | "year"
  | "term"
  | "student"
  | "feeType"
  | "amount"
  | "dueDate";

export type FeeStructureFilterRecord = {
  id: number;
  branchId: number;
  academicYearId: number;
  academicTermId: number | null;
  classLevelId: number;
  feeGroupId: number;
  feeTypeId: number;
  branchName: string;
  className: string;
  yearName: string;
  termName: string | null;
  studentName: string | null;
  studentLastName: string | null;
  studentAdmissionNumber: string | null;
  groupName: string;
  typeName: string;
  amount: string;
  currency: string;
  dueDate: string;
};

export type FeeStructureFilters = {
  branchId?: number | null;
  academicYearId?: number | null;
  academicTermId?: number | null;
  classLevelId?: number | null;
  feeTypeId?: number | null;
  search?: string;
  sortBy?: FeeStructureSortBy;
  sortDirection?: "asc" | "desc";
};

export function filterAndSortFeeStructures<T extends FeeStructureFilterRecord>(
  structures: readonly T[],
  filters: FeeStructureFilters,
): T[] {
  const search = filters.search?.trim().toLocaleLowerCase() ?? "";
  const matchingStructures = structures.filter((structure) => {
    if (filters.branchId != null && structure.branchId !== filters.branchId) return false;
    if (filters.academicYearId != null && structure.academicYearId !== filters.academicYearId) return false;
    if (filters.academicTermId != null && structure.academicTermId !== filters.academicTermId) return false;
    if (filters.classLevelId != null && structure.classLevelId !== filters.classLevelId) return false;
    if (filters.feeTypeId != null && structure.feeTypeId !== filters.feeTypeId) return false;
    if (!search) return true;

    return [
      structure.branchName,
      structure.className,
      structure.yearName,
      structure.termName,
      structure.studentName,
      structure.studentLastName,
      structure.studentAdmissionNumber,
      structure.groupName,
      structure.typeName,
      structure.amount,
      structure.currency,
      structure.dueDate,
    ].some((value) => value?.toLocaleLowerCase().includes(search));
  });

  const sortBy = filters.sortBy ?? "dueDate";
  const direction = filters.sortDirection === "desc" ? -1 : 1;
  return matchingStructures.sort((first, second) => {
    const comparison = sortBy === "amount"
      ? Number(first.amount) - Number(second.amount)
      : sortBy === "dueDate"
        ? first.dueDate.localeCompare(second.dueDate)
        : sortBy === "student"
          ? `${first.studentLastName ?? ""} ${first.studentName ?? ""}`.localeCompare(
            `${second.studentLastName ?? ""} ${second.studentName ?? ""}`,
          )
          : sortBy === "branch"
            ? first.branchName.localeCompare(second.branchName)
            : sortBy === "class"
              ? first.className.localeCompare(second.className)
              : sortBy === "year"
                ? first.yearName.localeCompare(second.yearName)
                : sortBy === "term"
                  ? (first.termName ?? "").localeCompare(second.termName ?? "")
                  : first.typeName.localeCompare(second.typeName);
    return comparison === 0 ? first.id - second.id : comparison * direction;
  });
}
