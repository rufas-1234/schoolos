export const subscriptionModules = [
  { key: "students", label: "Student records", permissions: ["students.view", "students.create", "students.update"] },
  { key: "academics", label: "Academics", permissions: ["academics.manage", "academics.delete", "results.enter", "results.publish"] },
  { key: "examinations", label: "Examinations and reports", permissions: ["examinations.create", "examinations.delete", "results.enter", "results.publish"] },
  { key: "staff", label: "Staff and HR", permissions: ["staff.manage", "staff.payroll.pay"] },
  { key: "fees", label: "Fees", permissions: ["fees.manage", "payments.record"] },
  { key: "accounts", label: "Finance and accounts", permissions: ["accounts.manage"] },
  { key: "inventory", label: "Inventory", permissions: ["inventory.manage"] },
  { key: "library", label: "Library", permissions: ["library.manage"] },
  { key: "dormitories", label: "Dormitories", permissions: ["dormitories.manage"] },
  { key: "transport", label: "Transport", permissions: ["transport.manage"] },
] as const;

export type SubscriptionModuleKey = (typeof subscriptionModules)[number]["key"];

export function getPermissionSubscriptionModule(permissionKey: string): SubscriptionModuleKey | null {
  return subscriptionModules.find((module) => module.permissions.includes(permissionKey as never))?.key ?? null;
}

export function isSubscriptionCurrent(input: {
  status: string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.status === "trialing") return Boolean(input.trialEndsAt && input.trialEndsAt > now);
  if (input.status === "active") {
    if (!input.currentPeriodEnd) return true;
    const graceEnd = new Date(input.currentPeriodEnd.getTime() + 7 * 86_400_000);
    return graceEnd > now;
  }
  if (input.status === "past_due") return Boolean(input.graceUntil && input.graceUntil > now);
  return false;
}

export function getSubscriptionPeriodEnd(start: Date, interval: string) {
  const end = new Date(start);
  if (interval === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}
