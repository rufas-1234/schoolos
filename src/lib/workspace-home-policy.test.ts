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
    expect(getWorkspaceHomePath(["roles.manage", "results.enter"])).toBe("/admin/settings/roles");
  });

  it("routes other least-privilege accounts to an allowed workspace", () => {
    expect(getWorkspaceHomePath(["students.view"])).toBe("/admin/students");
    expect(getWorkspaceHomePath([])).toBe("/unauthorized");
  });
});
