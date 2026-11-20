import type { GradeBand } from "./examination-policy";

export type ExamRemarkAuthor = "classTeacher" | "headteacher";

type RemarkTone = "excellent" | "veryGood" | "good" | "support";

const remarkVariants: Record<ExamRemarkAuthor, Record<RemarkTone, readonly string[]>> = {
  classTeacher: {
    excellent: [
      "Excellent work—keep building on this success.",
      "Outstanding effort; continue aiming high.",
      "A superb result—maintain this positive momentum.",
      "Your excellent progress is commendable; keep it up.",
      "A strong achievement—continue striving for excellence.",
    ],
    veryGood: [
      "Very good work—keep building on this success.",
      "A strong performance; keep up the consistent effort.",
      "You have made very good progress—continue aiming high.",
      "An impressive achievement; maintain this momentum.",
      "Your hard work is showing—keep it up.",
    ],
    good: [
      "Good work—keep practicing to strengthen these skills.",
      "You are making steady progress; continue with consistent effort.",
      "A good result—keep building your confidence and understanding.",
      "Well done on this progress; keep working toward your goals.",
      "Good effort; maintain this focus in your studies.",
    ],
    support: [
      "Keep practicing the core skills and seek help when needed.",
      "With regular practice, you can continue to improve.",
      "Focus on the learning goals and ask for support when useful.",
      "Steady effort and extra practice will help strengthen your understanding.",
      "Keep working through challenging topics one step at a time.",
    ],
  },
  headteacher: {
    excellent: [
      "An excellent achievement; continue nurturing this commitment to learning.",
      "Outstanding progress—keep setting and reaching high goals.",
      "Your dedication is reflected in this excellent result.",
      "A commendable performance; sustain this positive momentum.",
      "Excellent work—continue building on this success.",
    ],
    veryGood: [
      "A very good result; continue developing these strong learning habits.",
      "Your progress is impressive—keep working toward your goals.",
      "Very good work; continued effort will bring further success.",
      "A strong achievement—maintain this positive approach to learning.",
      "You have made very good progress; keep striving to improve.",
    ],
    good: [
      "A good achievement; consistent effort will support further progress.",
      "Your steady progress is encouraging—keep building on it.",
      "Good work; continue strengthening your knowledge and skills.",
      "A positive result—stay focused on your learning goals.",
      "Your effort is appreciated; keep working steadily.",
    ],
    support: [
      "Regular practice and support will help you make further progress.",
      "Keep working steadily and ask for help with challenging topics.",
      "Focus on the learning goals; improvement comes with consistent effort.",
      "With continued practice, you can strengthen your understanding.",
      "Take each learning step steadily and seek support when needed.",
    ],
  },
};

function remarkTone(grade: GradeBand): RemarkTone {
  const remark = grade.performanceRemark.toLowerCase();
  if (/\b(very good|very strong|above average|commendable)\b/.test(remark)) return "veryGood";
  if (/\b(excellent|outstanding|exceptional|superb|distinguished)\b/.test(remark)) return "excellent";
  if (/\b(needs?|weak|below|practice|support|develop|improv|ungraded)\b/.test(remark)) return "support";
  if (/\b(good|satisfactory|fair|pass|progress|steady)\b/.test(remark)) return "good";

  const description = `${grade.description} ${grade.grade}`.toLowerCase();
  if (/\b(very good|very strong|above average|commendable)\b/.test(description)) return "veryGood";
  if (/\b(excellent|outstanding|exceptional|superb|distinguished)\b/.test(description)) return "excellent";
  if (/\b(needs?|weak|below|practice|support|develop|improv|ungraded)\b/.test(description)) return "support";
  if (/\b(good|satisfactory|fair|pass|progress|steady)\b/.test(description)) return "good";
  if (grade.minPercent >= 85) return "excellent";
  if (grade.minPercent >= 70) return "veryGood";
  if (grade.minPercent >= 50) return "good";
  return "support";
}

export function examRemarkVariantIndex(enrollmentId: number): number {
  return ((enrollmentId % 5) + 5) % 5;
}

export function resolveExamReportRemark(
  customRemark: string | null | undefined,
  grade: GradeBand | null,
  author: ExamRemarkAuthor,
  variantIndex: number,
): string | null {
  const custom = customRemark?.trim();
  if (custom) return custom;
  if (!grade) return null;
  const variants = remarkVariants[author][remarkTone(grade)];
  const index = ((variantIndex % variants.length) + variants.length) % variants.length;
  return variants[index];
}
