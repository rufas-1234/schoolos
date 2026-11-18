import { describe, expect, it } from "vitest";
import { getWorkspaceHomePath } from "./workspace-home-policy";

describe("workspace home policy", () => {
  it("sends teachers with academic and exam setup access to the teacher portal", () => {
    expect(getWorkspaceHomePath([
      "academics.manage",
      "students.view",
      "students.create",
      "students.update",
      "examinations.create",
      "results.enter",
    ])).toBe("/portal/teacher");
  });

  it("prefers administration for accounts with administrator access", () => {
    expect(getWorkspaceHomePath(["dashboard.view", "results.enter"])).toBe("/admin/dashboard");
    expect(getWorkspaceHomePath(["roles.manage", "results.enter"])).toBe("/admin/users");
  });

  it("routes other least-privilege accounts to an allowed workspace", () => {
    expect(getWorkspaceHomePath(["students.view"])).toBe("/admin/students");
    expect(getWorkspaceHomePath([])).toBe("/unauthorized");
  });

  it("routes library and dormitory caretakers to their dedicated portals", () => {
    expect(getWorkspaceHomePath(["library.manage"])).toBe("/portal/library");
    expect(getWorkspaceHomePath(["dormitories.manage"])).toBe("/portal/dormitories");
    expect(getWorkspaceHomePath(["library.manage", "dormitories.manage"])).toBe("/portal/dormitories");
    expect(getWorkspaceHomePath(["library.manage", "fees.manage"])).toBe("/admin/fees/collection");
  });

  it("routes linked students and parents to their own portals", () => {
    expect(getWorkspaceHomePath([], { student: true })).toBe("/portal/student");
    expect(getWorkspaceHomePath([], { parent: true })).toBe("/portal/parent");
  });

  it("keeps administrator and teacher workspaces ahead of linked family portals", () => {
    expect(getWorkspaceHomePath(["dashboard.view"], { student: true })).toBe("/admin/dashboard");
    expect(getWorkspaceHomePath(["results.enter"], { parent: true })).toBe("/portal/teacher");
  });
});
