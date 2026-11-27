"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { subscriptionModules } from "@/lib/subscription-policy";
import { requirePlatformAdmin } from "@/lib/platform-access";

export type PlanActionState = { error?: string; success?: string };

const id = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const modules = new Set<string>(subscriptionModules.map((item) => item.key));
const planSchema = z.object({
  planId: z.union([z.literal(""), id]),
  code: z.string().trim().min(2).max(48).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000),
  billingInterval: z.enum(["monthly", "termly", "yearly"]),
  pricingModel: z.enum(["flat", "per_student"]),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  studentLimit: z.union([z.literal(""), z.string().regex(/^\d+$/)]),
  branchLimit: z.union([z.literal(""), z.string().regex(/^\d+$/)]),
  trialDays: z.string().regex(/^\d{1,3}$/),
  sortOrder: z.string().regex(/^\d{1,4}$/),
  isActive: z.enum(["true", "false"]),
});

export async function saveSubscriptionPlan(_previous: PlanActionState, formData: FormData): Promise<PlanActionState> {
  await requirePlatformAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  const includedModules = [...new Set(["students", ...formData.getAll("modules").map(String)])];
  if (!parsed.success || !includedModules.length || includedModules.some((key) => !modules.has(key))) {
    return { error: "Check the plan name, code, price, limits, currency, and selected modules." };
  }
  const values = parsed.data;
  if (Number(values.amount) < 0 || (values.billingInterval === "yearly" && Number(values.amount) === 0)) {
    return { error: "Enter a positive price for paid plans. Use the trial plan for free access." };
  }
  if (values.planId) {
    const [existing] = await db.select({ id: subscriptionPlans.id, isTrial: subscriptionPlans.isTrial })
      .from(subscriptionPlans).where(eq(subscriptionPlans.id, values.planId)).limit(1);
    if (!existing) return { error: "That plan was not found." };
    if (existing.isTrial) return { error: "The system trial plan is managed by the platform and cannot be edited here." };
    await db.update(subscriptionPlans).set({
      code: values.code, name: values.name, description: values.description || null,
      billingInterval: values.billingInterval, pricingModel: values.pricingModel, currency: values.currency.toUpperCase(), amount: values.amount,
      studentLimit: values.studentLimit ? Number(values.studentLimit) : null,
      branchLimit: values.branchLimit ? Number(values.branchLimit) : null,
      trialDays: Number(values.trialDays), includedModules, isActive: values.isActive === "true",
      sortOrder: Number(values.sortOrder),
    }).where(eq(subscriptionPlans.id, values.planId));
  } else {
    await db.insert(subscriptionPlans).values({
      publicId: randomUUID(), code: values.code, name: values.name,
      description: values.description || null, billingInterval: values.billingInterval, pricingModel: values.pricingModel,
      currency: values.currency.toUpperCase(), amount: values.amount,
      studentLimit: values.studentLimit ? Number(values.studentLimit) : null,
      branchLimit: values.branchLimit ? Number(values.branchLimit) : null,
      trialDays: Number(values.trialDays), includedModules,
      isActive: values.isActive === "true", sortOrder: Number(values.sortOrder),
    });
  }
  revalidatePath("/platform/plans");
  revalidatePath("/platform/subscriptions");
  return { success: values.planId ? "Plan updated." : "Plan created." };
}
