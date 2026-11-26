import { describe, expect, it } from "vitest";
import {
  feePaymentWorkspaceResult,
  getFuzzySearchNgrams,
  rankWorkspaceSearchResults,
  studentCertificateWorkspaceResult,
  studentIdWorkspaceResult,
} from "./workspace-search-policy";

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

  it("prioritizes student and staff profiles and core pages over matching user emails", () => {
    const matches = [
      { id: "email", title: "Rufas Lubang", description: "School user · rufaslubang3@gmail.com", href: "/users", category: "Users" },
      { id: "page", title: "Rufas", description: "Core school functionality", href: "/page", category: "Pages" },
      { id: "staff", title: "Rufas Lubang", description: "Staff profile", href: "/staff", category: "Staff" },
      { id: "student", title: "Rufas Lubang", description: "Student profile", href: "/student", category: "Students" },
    ];

    expect(rankWorkspaceSearchResults("rufas", matches).map((result) => result.id))
      .toEqual(["student", "staff", "page", "email"]);
  });

  it("still finds user accounts when searching by their email address", () => {
    const user = {
      id: "email",
      title: "Rufas Lubang",
      description: "School user · rufaslubang3@gmail.com",
      href: "/users",
      category: "Users",
    };

    expect(rankWorkspaceSearchResults("rufaslubang3@gmail.com", [user]))
      .toEqual([user]);
  });

  it("does not return unrelated results for a weak match", () => {
    expect(rankWorkspaceSearchResults("zzzzqx", results)).toEqual([]);
  });

  it("links a matched student search result to that student's ID filter", () => {
    expect(studentIdWorkspaceResult({ publicId: "student-public-id", firstName: "Radhika", lastName: "Shriwastav", admissionNumber: "S-104" }))
      .toMatchObject({
        id: "student-id-student-public-id",
        href: "/admin/students/ids?search=S-104",
        category: "Students",
        searchTerms: expect.arrayContaining(["Radhika Shriwastav", "S-104", "ID card"]),
      });
  });

  it("links a fee receipt search result with the public ID expected by its receipt page", () => {
    expect(feePaymentWorkspaceResult({
      publicId: "payment-public-id",
      receiptNumber: "R-104",
      studentName: "Radhika Shriwastav",
      invoiceNumber: "INV-104",
    })).toMatchObject({
      id: "fee-payment-payment-public-id",
      href: "/admin/fees/receipt/payment-public-id",
      category: "Fees",
    });
  });

  it("links a certificate search result to its print view with its academic year preserved", () => {
    expect(studentCertificateWorkspaceResult({
      publicId: "certificate-public-id",
      certificateNumber: "CERT-2026-1234ABCD",
      category: "Leadership",
      title: "Prefect Service",
      issuedAt: "2026-05-14",
      academicYearId: 42,
      academicYearName: "2026",
      firstName: "Radhika",
      lastName: "Shriwastav",
      admissionNumber: "S-104",
    })).toMatchObject({
      id: "student-certificate-certificate-public-id",
      href: "/admin/academics/certificates/certificate-public-id/print?academicYearId=42",
      category: "Academics",
      searchTerms: expect.arrayContaining(["Leadership", "CERT-2026-1234ABCD", "2026"]),
    });
  });
});
