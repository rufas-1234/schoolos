import { describe, expect, it } from "vitest";
import { resolveSchoolChoice } from "./school-context-policy";

const choices = [
  { schoolPublicId: "school-a", schoolName: "A School" },
  { schoolPublicId: "school-b", schoolName: "B School" },
];

describe("resolveSchoolChoice", () => {
  it("automatically selects the only membership", () => {
    expect(resolveSchoolChoice(choices.slice(0, 1), undefined, true)).toEqual(choices[0]);
  });

  it("requires a selection when a user has multiple schools", () => {
    expect(resolveSchoolChoice(choices, undefined, true)).toBeNull();
  });

  it("accepts only a school present in the user's memberships", () => {
    expect(resolveSchoolChoice(choices, "school-b", true)).toEqual(choices[1]);
    expect(resolveSchoolChoice(choices, "school-c", true)).toBeNull();
  });

  it("pins users to the configured default when multischool is disabled", () => {
    expect(resolveSchoolChoice(choices, "school-b", false, "school-a")).toEqual(choices[0]);
    expect(resolveSchoolChoice(choices, "school-b", false, "school-c")).toBeNull();
  });

  it("falls back to the selected or first membership when no default is configured", () => {
    expect(resolveSchoolChoice(choices, "school-b", false)).toEqual(choices[1]);
    expect(resolveSchoolChoice(choices, undefined, false)).toEqual(choices[0]);
  });
});
