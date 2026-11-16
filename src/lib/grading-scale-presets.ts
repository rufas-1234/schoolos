import type { GradeBand } from "./examination-policy";

export type GradingScalePreset = {
  id: string;
  label: string;
  name: string;
  note: string;
  bands: GradeBand[];
};

export const GRADING_SCALE_PRESETS: GradingScalePreset[] = [
  {
    id: "south-sudan",
    label: "South Sudan-style A–F",
    name: "South Sudan A-F",
    note: "A simple A–F starting point. Confirm the percentage bands match your school policy.",
    bands: [
      { minPercent: 0, maxPercent: 40, grade: "F", description: "Below standard", performanceRemark: "Needs additional support" },
      { minPercent: 40, maxPercent: 50, grade: "E", description: "Basic", performanceRemark: "Keep practicing" },
      { minPercent: 50, maxPercent: 60, grade: "D", description: "Satisfactory", performanceRemark: "Making progress" },
      { minPercent: 60, maxPercent: 70, grade: "C", description: "Good", performanceRemark: "Good effort" },
      { minPercent: 70, maxPercent: 80, grade: "B", description: "Very good", performanceRemark: "Very good work" },
      { minPercent: 80, maxPercent: 100, grade: "A", description: "Excellent", performanceRemark: "Excellent work" },
    ],
  },
  {
    id: "kenya-844",
    label: "Kenya 8-4-4 A–E",
    name: "Kenya 8-4-4",
    note: "Starter percentage bands for school use. KCSE grade boundaries can vary by subject and year; adjust to your school policy.",
    bands: [
      { minPercent: 0, maxPercent: 30, grade: "E", description: "Below standard", performanceRemark: "Needs additional support" },
      { minPercent: 30, maxPercent: 35, grade: "D-", description: "Weak", performanceRemark: "Keep practicing" },
      { minPercent: 35, maxPercent: 40, grade: "D", description: "Below average", performanceRemark: "Making progress" },
      { minPercent: 40, maxPercent: 45, grade: "D+", description: "Average", performanceRemark: "Satisfactory effort" },
      { minPercent: 45, maxPercent: 50, grade: "C-", description: "Fair", performanceRemark: "Keep working steadily" },
      { minPercent: 50, maxPercent: 55, grade: "C", description: "Satisfactory", performanceRemark: "Good effort" },
      { minPercent: 55, maxPercent: 60, grade: "C+", description: "Above average", performanceRemark: "Good progress" },
      { minPercent: 60, maxPercent: 65, grade: "B-", description: "Good", performanceRemark: "Good work" },
      { minPercent: 65, maxPercent: 70, grade: "B", description: "Very good", performanceRemark: "Very good work" },
      { minPercent: 70, maxPercent: 75, grade: "B+", description: "Excellent", performanceRemark: "Excellent effort" },
      { minPercent: 75, maxPercent: 80, grade: "A-", description: "Excellent", performanceRemark: "Excellent work" },
      { minPercent: 80, maxPercent: 100, grade: "A", description: "Outstanding", performanceRemark: "Outstanding work" },
    ],
  },
];
