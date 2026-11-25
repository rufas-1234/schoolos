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
  schools,
} from "@/db/schema";
import { requireSchoolPermission } from "@/lib/access-control";
import { isCalendarDate } from "@/lib/academic-policy";
import {
  nextGeneratedChartAccountCode,
  type GeneratedChartAccountType,
} from "@/lib/account-code-policy";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { formatCostMinorUnits, parseCostMinorUnits } from "@/lib/inventory-policy";
import {
  getStaffPayrollPaymentError,
  recordStaffPayrollPayment,
} from "@/lib/staff-payroll-payment";

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
  revalidatePath("/portal/finance");
  revalidatePath("/admin/hr/payroll");
}

class GeneratedChartAccountCodeExhaustedError extends Error {
  constructor(accountType: GeneratedChartAccountType) {
    super(`No short numeric account codes remain for ${accountType} accounts.`);
    this.name = "GeneratedChartAccountCodeExhaustedError";
  }
}

async function lockSchoolChartAccountCodes(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
) {
  const [school] = await tx.select({ id: schools.id }).from(schools)
    .where(eq(schools.id, schoolId)).for("update").limit(1);
  if (!school) throw new Error("The school account code sequence could not be locked.");
}

async function createGeneratedChartAccountCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  schoolId: number,
  accountType: GeneratedChartAccountType,
): Promise<string> {
  await lockSchoolChartAccountCodes(tx, schoolId);
  const accounts = await tx.select({ code: chartOfAccounts.code }).from(chartOfAccounts)
    .where(eq(chartOfAccounts.schoolId, schoolId));
  const code = nextGeneratedChartAccountCode(accountType, accounts.map((account) => account.code));
  if (!code) throw new GeneratedChartAccountCodeExhaustedError(accountType);
  return code;
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
      await lockSchoolChartAccountCodes(tx, context.schoolId);
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
    chartAccountId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    newAssetAccountName: z.string().trim().max(160).transform((value) => value || null),
    currency: z.string().regex(/^[A-Z]{3}$/),
    bankName: nameField,
    accountName: nameField,
    accountNumber: z.string().trim().max(80),
    openingBalance: z.string().trim(),
  }).safeParse({
    chartAccountId: value(formData, "chartAccountId"),
    newAssetAccountName: value(formData, "newAssetAccountName"),
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
  const hasExistingAssetAccount = parsed.data.chartAccountId !== null;
  const hasNewAssetAccount = parsed.data.newAssetAccountName !== null;
  if (hasExistingAssetAccount === hasNewAssetAccount) {
    return { error: "Choose an existing asset account or enter a new account name, but not both." };
  }
  const [currency] = await db.select({ code: schoolCurrencies.code }).from(schoolCurrencies)
    .where(and(
      eq(schoolCurrencies.schoolId, context.schoolId),
      eq(schoolCurrencies.code, parsed.data.currency),
    )).limit(1);
  if (!currency) return { error: "Choose a currency configured for this school." };
    let chartAccount: { id: number; accountType: string; status: string } | null = null;
    if (parsed.data.chartAccountId !== null) {
      const [existingAccount] = await db.select({
        id: chartOfAccounts.id,
        accountType: chartOfAccounts.accountType,
        status: chartOfAccounts.status,
      }).from(chartOfAccounts).where(and(
        eq(chartOfAccounts.id, parsed.data.chartAccountId),
        eq(chartOfAccounts.schoolId, context.schoolId),
      )).limit(1);
      chartAccount = existingAccount ?? null;
  }
    let matchingNewAssetAccount: { id: number; accountType: string; status: string } | null = null;
    if (parsed.data.newAssetAccountName) {
      const [existingAccount] = await db.select({
        id: chartOfAccounts.id,
        accountType: chartOfAccounts.accountType,
        status: chartOfAccounts.status,
      }).from(chartOfAccounts).where(and(
        eq(chartOfAccounts.schoolId, context.schoolId),
        eq(chartOfAccounts.name, parsed.data.newAssetAccountName),
      )).limit(1);
      if (existingAccount) {
        if (existingAccount.accountType !== "asset") {
          return { error: "A chart category with this name already exists with a different account type." };
        }
        if (existingAccount.status !== "active") {
          return { error: "This account is inactive. Reactivate it from the chart of accounts or choose another name." };
        }
        matchingNewAssetAccount = existingAccount;
      }
    }
    if ((parsed.data.chartAccountId !== null &&
          (!chartAccount || chartAccount.accountType !== "asset" || chartAccount.status !== "active"))) {
      return { error: "Choose an active asset account belonging to this school." };
    }
  const publicId = randomUUID();
    const createdAssetAccountPublicId = parsed.data.newAssetAccountName && !matchingNewAssetAccount ? randomUUID() : null;
  try {
    await db.transaction(async (tx) => {
        let chartAccountId = chartAccount?.id ?? matchingNewAssetAccount?.id;
        if (chartAccountId === undefined) {
          if (!parsed.data.newAssetAccountName || !createdAssetAccountPublicId) {
            throw new Error("A linked asset account was not selected or created.");
          }
          const generatedAssetAccountCode = await createGeneratedChartAccountCode(tx, context.schoolId, "asset");
          await tx.insert(chartOfAccounts).values({
            publicId: createdAssetAccountPublicId,
            schoolId: context.schoolId,
            code: generatedAssetAccountCode,
            name: parsed.data.newAssetAccountName,
            accountType: "asset",
            description: "Created while registering a bank or cash account.",
          });
          const [createdAccount] = await tx.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
            .where(and(
              eq(chartOfAccounts.publicId, createdAssetAccountPublicId),
              eq(chartOfAccounts.schoolId, context.schoolId),
            )).limit(1);
          if (!createdAccount) throw new Error("The new linked asset account could not be loaded.");
          chartAccountId = createdAccount.id;
          await writeAudit(
            tx,
            context.schoolId,
            context.user.id,
            "chart_account.created",
            "chart_of_account",
            createdAssetAccountPublicId,
            ["code", "name", "accountType", "description"],
          );
        }
      await tx.insert(schoolBankAccounts).values({
        publicId,
        schoolId: context.schoolId,
          chartAccountId,
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
    if (error instanceof GeneratedChartAccountCodeExhaustedError) {
      return { error: "No short numeric codes remain for new asset accounts. Add an asset account manually and try again." };
    }
    if (isDuplicateEntryError(error)) return { error: "A bank or cash account with that display name already exists." };
    throw error;
  }
  revalidateAccounts();
  return {
    success: true,
    message: `Bank or cash account saved.${createdAssetAccountPublicId ? " A new asset account was added to the chart." : ""}`,
  };
}

export async function createAccountTransaction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  const parsed = z.object({
    transactionType: z.enum(["income", "expense"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    categoryAccountId: z.union([z.literal(""), idField]).transform((value) => value === "" ? null : value),
    newCategoryName: z.string().trim().max(160).transform((value) => value || null),
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
    newCategoryName: value(formData, "newCategoryName"),
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
  const hasExistingCategory = parsed.data.categoryAccountId !== null;
  const hasNewCategory = parsed.data.newCategoryName !== null;
  if (hasExistingCategory === hasNewCategory) {
    return { error: "Choose an existing category or enter a new category, but not both." };
  }
  const expectedType = parsed.data.transactionType;
  let category: { id: number; accountType: string; status: string } | null = null;
  if (parsed.data.categoryAccountId !== null) {
    const [existingCategory] = await db.select({
      id: chartOfAccounts.id,
      accountType: chartOfAccounts.accountType,
      status: chartOfAccounts.status,
    }).from(chartOfAccounts).where(and(
      eq(chartOfAccounts.id, parsed.data.categoryAccountId),
      eq(chartOfAccounts.schoolId, context.schoolId),
    )).limit(1);
    category = existingCategory ?? null;
  }
  let matchingNewCategory: { id: number; accountType: string; status: string } | null = null;
  if (parsed.data.newCategoryName) {
    const [existingCategory] = await db.select({
      id: chartOfAccounts.id,
      accountType: chartOfAccounts.accountType,
      status: chartOfAccounts.status,
    }).from(chartOfAccounts).where(and(
      eq(chartOfAccounts.schoolId, context.schoolId),
      eq(chartOfAccounts.name, parsed.data.newCategoryName),
    )).limit(1);
    if (existingCategory) {
      if (existingCategory.accountType !== expectedType) {
        return { error: "A chart category with this name already exists with a different account type." };
      }
      if (existingCategory.status !== "active") {
        return { error: "This category is inactive. Reactivate it from the chart of accounts or choose another name." };
      }
      matchingNewCategory = existingCategory;
    }
  }
  const [bankAccount] = parsed.data.bankAccountId === null ? [null] : await db.select({ id: schoolBankAccounts.id })
    .from(schoolBankAccounts).where(and(
      eq(schoolBankAccounts.id, parsed.data.bankAccountId),
      eq(schoolBankAccounts.schoolId, context.schoolId),
      eq(schoolBankAccounts.status, "active"),
    )).limit(1);
  if ((parsed.data.categoryAccountId !== null &&
        (!category || category.accountType !== expectedType || category.status !== "active")) ||
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
  const createdCategoryPublicId = parsed.data.newCategoryName && !matchingNewCategory ? randomUUID() : null;
  try {
    await db.transaction(async (tx) => {
      let categoryAccountId = category?.id ?? matchingNewCategory?.id;
      if (categoryAccountId === undefined) {
        if (!parsed.data.newCategoryName || !createdCategoryPublicId) {
          throw new Error("A transaction category was not selected or created.");
        }
        const createdCategoryCode = await createGeneratedChartAccountCode(tx, context.schoolId, expectedType);
        await tx.insert(chartOfAccounts).values({
          publicId: createdCategoryPublicId,
          schoolId: context.schoolId,
          code: createdCategoryCode,
          name: parsed.data.newCategoryName,
          accountType: expectedType,
          description: `Created while recording ${expectedType}.`,
        });
        const [createdCategory] = await tx.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
          .where(and(
            eq(chartOfAccounts.publicId, createdCategoryPublicId),
            eq(chartOfAccounts.schoolId, context.schoolId),
          )).limit(1);
        if (!createdCategory) throw new Error("The new transaction category could not be loaded.");
        categoryAccountId = createdCategory.id;
        await writeAudit(
          tx,
          context.schoolId,
          context.user.id,
          "chart_account.created",
          "chart_of_account",
          createdCategoryPublicId,
          ["code", "name", "accountType", "description"],
        );
      }
      await tx.insert(accountTransactions).values({
        publicId,
        schoolId: context.schoolId,
        transactionType: expectedType,
        categoryAccountId,
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
  } catch (error) {
    if (error instanceof GeneratedChartAccountCodeExhaustedError) {
      return { error: `No short numeric codes remain for new ${expectedType} categories. Add a category manually and try again.` };
    }
    throw error;
  }
  revalidateAccounts();
  return {
    success: true,
    message: `${expectedType === "income" ? "Income" : "Expense"} submitted for approval.${createdCategoryPublicId ? " A new category was added to the chart." : ""}`,
  };
}

export async function payStaffPayrollRecord(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const context = await requireSchoolPermission("accounts.manage");
  if (!context.grantedPermissions.includes("staff.payroll.pay")) {
    return { error: "Your role is not permitted to pay staff payroll. Ask a school administrator to grant this permission." };
  }
  const parsed = z.object({
    payrollPublicId: z.string().uuid(),
    categoryAccountId: idField,
    bankAccountId: idField,
    paidDate: z.string().refine(isCalendarDate),
    reference: z.string().trim().max(120),
  }).safeParse({
    payrollPublicId: value(formData, "payrollPublicId"),
    categoryAccountId: value(formData, "categoryAccountId"),
    bankAccountId: value(formData, "bankAccountId"),
    paidDate: value(formData, "paidDate"),
    reference: value(formData, "reference"),
  });
  if (!parsed.success) return { error: "Choose an expense category, matching bank or cash account, and valid payment date." };

  try {
    const outcome = await recordStaffPayrollPayment({
      schoolPublicId: context.schoolPublicId,
      actorUserId: context.user.id,
      payrollPublicId: parsed.data.payrollPublicId,
      categoryAccountId: parsed.data.categoryAccountId,
      bankAccountId: parsed.data.bankAccountId,
      paidDate: parsed.data.paidDate,
      reference: parsed.data.reference,
    });
    if (outcome !== "paid") return { error: getStaffPayrollPaymentError(outcome) };
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A payment has already been recorded for this payroll record." };
    throw error;
  }

  revalidateAccounts();
  return { success: true, message: "Staff payment recorded in Accounts and payroll marked paid." };
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
