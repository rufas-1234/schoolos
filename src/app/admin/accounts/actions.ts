"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  accountTransactions,
  auditLogs,
  chartOfAccounts,
  fundTransfers,
  schoolCurrencies,
  schoolBankAccounts,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { formatCostMinorUnits, parseCostMinorUnits } from "@/lib/inventory-policy";

export type AccountActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const nameField = z.string().trim().min(1).max(160);
const optionalText = z.string().trim().max(1000).transform((value) => value || null);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function writeAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourcePublicId: string,
  changedFields: string[],
) {
  await tx.insert(auditLogs).values({ schoolId, actorUserId, action, resourceType, resourcePublicId, changedFields });
}

function revalidateAccounts() {
  revalidatePath("/admin/accounts");
}

export async function createChartAccount(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    code: z.string().trim().min(1).max(30),
    name: nameField,
    accountType: z.enum(["asset", "liability", "equity", "income", "expense"]),
    description: optionalText,
  }).safeParse({
    code: value(formData, "code"),
    name: value(formData, "name"),
    accountType: value(formData, "accountType"),
    description: value(formData, "description"),
  });
  if (!parsed.success) return { error: "Enter a valid account code, name, and type." };
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(chartOfAccounts).values({ publicId, schoolId: context.schoolId, ...parsed.data });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "chart_account.created",
        resourceType: "chart_of_account",
        resourcePublicId: publicId,
        changedFields: ["code", "name", "accountType", "description"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "An account with that code already exists." };
    throw error;
  }
  revalidateAccounts();
  return { success: true };
}

export async function createSchoolBankAccount(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    chartAccountId: idField,
    currency: z.string().regex(/^[A-Z]{3}$/),
    bankName: nameField,
    accountName: nameField,
    accountNumber: z.string().trim().max(80),
    openingBalance: z.string().trim(),
  }).safeParse({
    chartAccountId: value(formData, "chartAccountId"),
    currency: value(formData, "currency"),
    bankName: value(formData, "bankName"),
    accountName: value(formData, "accountName"),
    accountNumber: value(formData, "accountNumber"),
    openingBalance: value(formData, "openingBalance") || "0",
  });
  const openingBalance = parseCostMinorUnits(parsed.success ? parsed.data.openingBalance : "");
  const last4 = parsed.success ? parsed.data.accountNumber.replace(/\s/g, "").slice(-4) : "";
  if (!parsed.success || openingBalance === null ||
      (parsed.data.accountNumber && !/^[0-9 -]{4,80}$/.test(parsed.data.accountNumber))) {
    return { error: "Enter valid bank details and a non-negative opening balance." };
  }
  const [currency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
    .where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, parsed.data.currency),
    )).limit(1);
  if (!currency) return { error: "Choose a currency configured for this school." };
  const [chartAccount] = await db.select({ id: chartOfAccounts.id, accountType: chartOfAccounts.accountType })
    .from(chartOfAccounts).where(and(
      eq(chartOfAccounts.id, parsed.data.chartAccountId),
      eq(chartOfAccounts.schoolId, context.schoolId),
      eq(chartOfAccounts.status, "active"),
    )).limit(1);
  if (!chartAccount || chartAccount.accountType !== "asset") {
    return { error: "Choose an active asset account from this school’s chart of accounts." };
  }
  const publicId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schoolBankAccounts).values({
        publicId,
        schoolId: context.schoolId,
        chartAccountId: chartAccount.id,
        currency: parsed.data.currency,
        bankName: parsed.data.bankName,
        accountName: parsed.data.accountName,
        accountNumberLast4: last4 || null,
        openingBalance: formatCostMinorUnits(openingBalance),
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "bank_account.created",
        resourceType: "bank_account",
        resourcePublicId: publicId,
        changedFields: ["chartAccountId", "currency", "bankName", "accountName", "accountNumberLast4", "openingBalance"],
      });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A bank or cash account with that display name already exists." };
    throw error;
  }
  revalidateAccounts();
  return { success: true };
}

export async function createAccountTransaction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    transactionType: z.enum(["income", "expense"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    categoryAccountId: idField,
    bankAccountId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    transactionDate: z.string().refine(isCalendarDate),
    amount: z.string().trim(),
    description: z.string().trim().min(1).max(1000),
    payee: z.string().trim().max(200),
    reference: z.string().trim().max(120),
  }).safeParse({
    transactionType: value(formData, "transactionType"),
    currency: value(formData, "currency"),
    categoryAccountId: value(formData, "categoryAccountId"),
    bankAccountId: value(formData, "bankAccountId"),
    transactionDate: value(formData, "transactionDate"),
    amount: value(formData, "amount"),
    description: value(formData, "description"),
    payee: value(formData, "payee"),
    reference: value(formData, "reference"),
  });
  const amount = parseCostMinorUnits(parsed.success ? parsed.data.amount : "");
  if (!parsed.success || amount === null || amount === BigInt(0)) {
    return { error: "Enter a valid date, category, description, and positive amount." };
  }
  const expectedType = parsed.data.transactionType;
  const [category] = await db.select({ id: chartOfAccounts.id, accountType: chartOfAccounts.accountType })
    .from(chartOfAccounts).where(and(
      eq(chartOfAccounts.id, parsed.data.categoryAccountId),
      eq(chartOfAccounts.schoolId, context.schoolId),
      eq(chartOfAccounts.status, "active"),
    )).limit(1);
  const [bankAccount] = parsed.data.bankAccountId === null ? [null] : await db.select({ id: schoolBankAccounts.id })
    .from(schoolBankAccounts).where(and(
      eq(schoolBankAccounts.id, parsed.data.bankAccountId),
      eq(schoolBankAccounts.schoolId, context.schoolId),
      eq(schoolBankAccounts.status, "active"),
    )).limit(1);
  if (!category || category.accountType !== expectedType ||
      (parsed.data.bankAccountId !== null && !bankAccount)) {
    return { error: `Choose an active ${expectedType} category and bank account belonging to this school.` };
  }
  if (parsed.data.bankAccountId !== null) {
    const [linkedBank] = await db.select({ currency: schoolBankAccounts.currency })
      .from(schoolBankAccounts).where(and(
        eq(schoolBankAccounts.id, parsed.data.bankAccountId),
        eq(schoolBankAccounts.schoolId, context.schoolId),
      )).limit(1);
    if (linkedBank?.currency !== parsed.data.currency) {
      return { error: "The selected bank or cash account uses a different currency." };
    }
  } else {
    const [currency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
      .where(and(
        eq(schoolCurrencies.schoolId, context.schoolId),
        eq(schoolCurrencies.code, parsed.data.currency),
      )).limit(1);
    if (!currency) return { error: "Choose a currency configured for this school." };
  }
  const publicId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(accountTransactions).values({
      publicId,
      schoolId: context.schoolId,
      transactionType: expectedType,
      categoryAccountId: category.id,
      bankAccountId: bankAccount?.id ?? null,
      currency: parsed.data.currency,
      transactionDate: parsed.data.transactionDate,
      amount: formatCostMinorUnits(amount),
      description: parsed.data.description,
      payee: parsed.data.payee || null,
      reference: parsed.data.reference || null,
      status: "pending",
      submittedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `account_transaction.${expectedType}_submitted`,
      resourceType: "account_transaction",
      resourcePublicId: publicId,
      changedFields: ["transactionType", "categoryAccountId", "bankAccountId", "currency", "transactionDate", "amount", "description", "payee", "reference", "status"],
    });
  });
  revalidateAccounts();
  return { success: true, message: `${expectedType === "income" ? "Income" : "Expense"} submitted for approval.` };
}

export async function reviewAccountTransaction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    transactionId: idField,
    decision: z.enum(["approved", "rejected"]),
  }).safeParse({
    transactionId: value(formData, "transactionId"),
    decision: value(formData, "decision"),
  });
  if (!parsed.success) return { error: "Select a valid transaction and approval decision." };
  const outcome = await db.transaction(async (tx) => {
    const [transaction] = await tx.select({
      id: accountTransactions.id,
      publicId: accountTransactions.publicId,
      status: accountTransactions.status,
    }).from(accountTransactions)
      .where(and(
        eq(accountTransactions.id, parsed.data.transactionId),
        eq(accountTransactions.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!transaction) return "not-found";
    if (transaction.status !== "pending") return "already-reviewed";
    await tx.update(accountTransactions).set({
      status: parsed.data.decision,
      approvedBy: context.user.id,
      approvedAt: new Date(),
    }).where(eq(accountTransactions.id, transaction.id));
    await writeAudit(tx, context.schoolId, context.user.id, `account_transaction.${parsed.data.decision}`,
      "account_transaction", transaction.publicId, ["status", "approvedBy", "approvedAt"]);
    return "reviewed";
  });
  if (outcome === "not-found") return { error: "The transaction was not found for this school." };
  if (outcome === "already-reviewed") return { error: "This transaction has already been reviewed." };
  revalidateAccounts();
  return { success: true };
}

export async function createFundTransfer(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    sourceBankAccountId: idField,
    destinationBankAccountId: idField,
    transferDate: z.string().refine(isCalendarDate),
    amount: z.string().trim(),
    reference: z.string().trim().max(120),
    note: z.string().trim().max(500),
  }).safeParse({
    sourceBankAccountId: value(formData, "sourceBankAccountId"),
    destinationBankAccountId: value(formData, "destinationBankAccountId"),
    transferDate: value(formData, "transferDate"),
    amount: value(formData, "amount"),
    reference: value(formData, "reference"),
    note: value(formData, "note"),
  });
  const amount = parseCostMinorUnits(parsed.success ? parsed.data.amount : "");
  if (!parsed.success || amount === null || amount === BigInt(0) ||
      parsed.data.sourceBankAccountId === parsed.data.destinationBankAccountId) {
    return { error: "Choose two different bank accounts and enter a positive amount and valid date." };
  }
  const accounts = await db.select({
    id: schoolBankAccounts.id,
    currency: schoolBankAccounts.currency,
  }).from(schoolBankAccounts).where(and(
    eq(schoolBankAccounts.schoolId, context.schoolId),
    eq(schoolBankAccounts.status, "active"),
  ));
  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.sourceBankAccountId) || !accountIds.has(parsed.data.destinationBankAccountId)) {
    return { error: "Choose active source and destination accounts belonging to this school." };
  }
  const sourceAccount = accounts.find((account) => account.id === parsed.data.sourceBankAccountId);
  const destinationAccount = accounts.find((account) => account.id === parsed.data.destinationBankAccountId);
  if (!sourceAccount || !destinationAccount || sourceAccount.currency !== destinationAccount.currency) {
    return { error: "Fund transfers require source and destination accounts in the same currency." };
  }
  const publicId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(fundTransfers).values({
      publicId,
      schoolId: context.schoolId,
      sourceBankAccountId: parsed.data.sourceBankAccountId,
      destinationBankAccountId: parsed.data.destinationBankAccountId,
      currency: sourceAccount.currency,
      transferDate: parsed.data.transferDate,
      amount: formatCostMinorUnits(amount),
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      recordedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "fund_transfer.created",
      resourceType: "fund_transfer",
      resourcePublicId: publicId,
      changedFields: ["sourceBankAccountId", "destinationBankAccountId", "transferDate", "amount", "reference"],
    });
  });
  revalidateAccounts();
  return { success: true };
}
