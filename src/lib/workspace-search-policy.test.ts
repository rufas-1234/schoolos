import { describe, expect, it } from "vitest";
import { getFuzzySearchNgrams, rankWorkspaceSearchResults } from "./workspace-search-policy";

const results = [
  { id: "attendance", title: "Student Attendance Report", description: "Daily attendance by class and date", href: "/attendance", category: "Pages" },
  { id: "fees", title: "Fee Reports", description: "Collection and outstanding balance reports", href: "/fees", category: "Pages" },
  { id: "student", title: "Jonathon Smith", description: "Student · Admission no. S104", href: "/student", category: "Students" },
];

describe("workspace search policy", () => {
  it("generates bounded fuzzy-match n-grams only for useful query tokens", () => {
    expect(getFuzzySearchNgrams(["xy", "attendance"])).toEqual(["at", "te", "nd", "an", "ce"]);
    expect(getFuzzySearchNgrams([Array.from({ length: 120 }, (_, index) => String.fromCharCode(97 + index % 26)).join("")])).toHaveLength(8);
    expect(getFuzzySearchNgrams(["xy"])).toEqual([]);
  });

  it("finds closest page matches when the query contains typos", () => {
    expect(rankWorkspaceSearchResults("studnt attendnce", results).map((result) => result.id))
      .toContain("attendance");
  });

  it("ranks a misspelled name above unrelated results", () => {
    expect(rankWorkspaceSearchResults("jonaton smyth", results).map((result) => result.id))
      .toEqual(["student"]);
  });

  it("does not return unrelated results for a weak match", () => {
    expect(rankWorkspaceSearchResults("zzzzqx", results)).toEqual([]);
  });
});
