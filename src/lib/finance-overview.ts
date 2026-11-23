import { parseCostMinorUnits } from "./inventory-policy";

export type FinanceMonthAmount = {
  month: string;
  currency: string;
  amount: string;
};

export type FinanceMonthTransaction = FinanceMonthAmount & {
  transactionType: "income" | "expense";
};

export type FinanceTrendPoint = {
  month: string;
  feeCollections: bigint;
  otherIncome: bigint;
  expenses: bigint;
};

function toMinorUnits(value: string): bigint {
  const parsed = parseCostMinorUnits(value);
  if (parsed === null) throw new Error("Stored finance amount is invalid.");
  return parsed;
}

export function getFinanceMonthKeys(today: string, count: number): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7),
  );
}

export function buildFinanceTrend(
  months: string[],
  currency: string,
  collections: FinanceMonthAmount[],
  reversals: FinanceMonthAmount[],
  transactions: FinanceMonthTransaction[],
): FinanceTrendPoint[] {
  const points = new Map(months.map((month) => [month, {
    month,
    feeCollections: BigInt(0),
    otherIncome: BigInt(0),
    expenses: BigInt(0),
  }]));

  for (const row of collections) {
    const point = row.currency === currency ? points.get(row.month) : undefined;
    if (point) point.feeCollections += toMinorUnits(row.amount);
  }
  for (const row of reversals) {
    const point = row.currency === currency ? points.get(row.month) : undefined;
    if (point) point.feeCollections -= toMinorUnits(row.amount);
  }
  for (const row of transactions) {
    const point = row.currency === currency ? points.get(row.month) : undefined;
    if (!point) continue;
    const amount = toMinorUnits(row.amount);
    if (row.transactionType === "income") point.otherIncome += amount;
    else point.expenses += amount;
  }

  return [...points.values()];
}
