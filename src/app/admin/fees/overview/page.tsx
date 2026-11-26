import { FinanceOverviewPage } from "@/app/portal/finance/finance-overview";

export const dynamic = "force-dynamic";

export default function FeesOverviewPage() {
  return <FinanceOverviewPage adminView mode="fees" />;
}
