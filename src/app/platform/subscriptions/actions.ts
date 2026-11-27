"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { schools, schoolSubscriptions, subscriptionInvoices, subscriptionPlans } from "@/db/schema";
import { getSubscriptionPeriodEnd } from "@/lib/subscription-policy";
import { requirePlatformAdmin } from "@/lib/platform-access";

export type SubscriptionActionState = { error?: string; success?: string };
const positiveId = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());

export async function assignSchoolPlan(_previous: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const actor = await requirePlatformAdmin();
  const parsed = z.object({ schoolId: positiveId, planId: positiveId }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a school and an available plan." };
  const [[school], [plan]] = await Promise.all([
    db.select({ id: schools.id, isPracticeWorkspace: schools.isPracticeWorkspace, archivedAt: schools.archivedAt }).from(schools).where(eq(schools.id, parsed.data.schoolId)).limit(1),
    db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.id, parsed.data.planId), eq(subscriptionPlans.isActive, true))).limit(1),
  ]);
  if (!school || school.isPracticeWorkspace || school.archivedAt || !plan) return { error: "Choose an active school and an available plan." };

  const now = new Date();
  const trialing = plan.isTrial || plan.trialDays > 0;
  const pendingPayment = !trialing && Number(plan.amount) > 0;
  const periodEnd = trialing
    ? new Date(now.getTime() + Math.max(plan.trialDays, 1) * 86_400_000)
    : pendingPayment ? now : getSubscriptionPeriodEnd(now, plan.billingInterval);
  await db.insert(schoolSubscriptions).values({
    publicId: randomUUID(), schoolId: school.id, planId: plan.id,
    status: trialing ? "trialing" : pendingPayment ? "pending_payment" : "active",
    billingMode: "manual", currentPeriodStart: now, currentPeriodEnd: periodEnd,
    trialEndsAt: trialing ? periodEnd : null, graceUntil: null, cancelAtPeriodEnd: false,
    createdBy: actor.id,
  }).onDuplicateKeyUpdate({ set: {
    planId: plan.id, status: trialing ? "trialing" : pendingPayment ? "pending_payment" : "active",
    billingMode: "manual", currentPeriodStart: now, currentPeriodEnd: periodEnd,
    trialEndsAt: trialing ? periodEnd : null, graceUntil: null, cancelAtPeriodEnd: false,
    createdBy: actor.id,
  } });
  revalidatePath("/platform/subscriptions");
  revalidatePath("/subscription");
  return { success: trialing ? `Trial started for ${Math.max(plan.trialDays, 1)} days.` : pendingPayment ? "Plan assigned. Issue an invoice and confirm payment to activate it." : "Free plan activated." };
}

export async function createSubscriptionInvoice(_previous: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  await requirePlatformAdmin();
  const parsed = z.object({ schoolId: positiveId }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a school." };
  const [current] = await db.select({
    id: schoolSubscriptions.id, status: schoolSubscriptions.status,
    periodEnd: schoolSubscriptions.currentPeriodEnd, planId: subscriptionPlans.id,
    amount: subscriptionPlans.amount, currency: subscriptionPlans.currency,
    interval: subscriptionPlans.billingInterval, isTrial: subscriptionPlans.isTrial,
  }).from(schoolSubscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, schoolSubscriptions.planId))
    .where(eq(schoolSubscriptions.schoolId, parsed.data.schoolId)).limit(1);
  if (!current || current.isTrial || Number(current.amount) <= 0) return { error: "Assign a paid plan before creating an invoice." };
  const now = new Date();
  const start = current.periodEnd && current.periodEnd > now ? current.periodEnd : now;
  const end = getSubscriptionPeriodEnd(start, current.interval);
  const [duplicate] = await db.select({ id: subscriptionInvoices.id }).from(subscriptionInvoices)
    .where(and(eq(subscriptionInvoices.subscriptionId, current.id), eq(subscriptionInvoices.periodStart, start), eq(subscriptionInvoices.periodEnd, end))).limit(1);
  if (duplicate) return { error: "An invoice already exists for that billing period." };
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + 14);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  await db.insert(subscriptionInvoices).values({
    publicId: randomUUID(), schoolId: parsed.data.schoolId, subscriptionId: current.id,
    invoiceNumber: `SO-${now.getFullYear()}-${suffix}`, amount: current.amount, currency: current.currency,
    periodStart: start, periodEnd: end, dueAt, status: "open",
  });
  revalidatePath("/platform/subscriptions");
  revalidatePath("/subscription");
  return { success: "Subscription invoice created with a 14-day payment term." };
}

export async function confirmSubscriptionInvoice(_previous: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const actor = await requirePlatformAdmin();
  const parsed = z.object({ invoiceId: positiveId, paymentMethod: z.enum(["mpesa", "bank", "other"]), paymentReference: z.string().trim().min(2).max(120) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter the payment method and transaction reference." };
  const [invoice] = await db.select({ id: subscriptionInvoices.id, subscriptionId: subscriptionInvoices.subscriptionId, status: subscriptionInvoices.status, periodStart: subscriptionInvoices.periodStart, periodEnd: subscriptionInvoices.periodEnd })
    .from(subscriptionInvoices).where(eq(subscriptionInvoices.id, parsed.data.invoiceId)).limit(1);
  if (!invoice || invoice.status !== "open") return { error: "Only open invoices can be marked paid." };
  await db.transaction(async (tx) => {
    await tx.update(subscriptionInvoices).set({ status: "paid", paidAt: new Date(), paymentMethod: parsed.data.paymentMethod, paymentReference: parsed.data.paymentReference, confirmedBy: actor.id }).where(eq(subscriptionInvoices.id, invoice.id));
    await tx.update(schoolSubscriptions).set({ status: "active", currentPeriodStart: invoice.periodStart, currentPeriodEnd: invoice.periodEnd, trialEndsAt: null, graceUntil: null, cancelAtPeriodEnd: false }).where(eq(schoolSubscriptions.id, invoice.subscriptionId));
  });
  revalidatePath("/platform/subscriptions");
  revalidatePath("/subscription");
  return { success: "Payment confirmed and subscription activated." };
}
