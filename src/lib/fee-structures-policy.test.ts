import { describe, expect, it } from "vitest";
import { filterAndSortFeeStructures, type FeeStructureFilterRecord } from "./fee-structures-policy";

const structures: FeeStructureFilterRecord[] = [
  {
    id: 2,
    branchId: 2,
    academicYearId: 2026,
    academicTermId: 2,
    classLevelId: 5,
    feeGroupId: 1,
    feeTypeId: 3,
    branchName: "West Branch",
    className: "Class 5",
    yearName: "2026",
    termName: "Term 2",
    studentName: "Sam",
    studentLastName: "Jones",
    studentAdmissionNumber: "ADM-002",
    groupName: "Tuition",
    typeName: "Tuition fee",
    amount: "20.00",
    currency: "USD",
    dueDate: "2026-07-01",
  },
  {
    id: 1,
    branchId: 1,
    academicYearId: 2026,
    academicTermId: null,
    classLevelId: 4,
    feeGroupId: 1,
    feeTypeId: 3,
    branchName: "Main Branch",
    className: "Class 4",
    yearName: "2026",
    termName: null,
    studentName: "Alex",
    studentLastName: "Brown",
    studentAdmissionNumber: "ADM-001",
    groupName: "Tuition",
    typeName: "Tuition fee",
    amount: "100.00",
    currency: "USD",
    dueDate: "2026-06-01",
  },
];

describe("fee structure filters and sorting", () => {
  it("combines filters with case-insensitive search", () => {
    expect(filterAndSortFeeStructures(structures, {
      branchId: 2,
      academicYearId: 2026,
      feeTypeId: 3,
      search: "adm-002",
    }).map((structure) => structure.id)).toEqual([2]);
  });

  it("sorts numeric amounts and supports descending direction", () => {
    expect(filterAndSortFeeStructures(structures, {
      sortBy: "amount",
      sortDirection: "asc",
    }).map((structure) => structure.id)).toEqual([2, 1]);
    expect(filterAndSortFeeStructures(structures, {
      sortBy: "amount",
      sortDirection: "desc",
    }).map((structure) => structure.id)).toEqual([1, 2]);
  });
});
