import { AccountSecurityContent } from "@/components/account-security-content";
import { requireSchoolMember } from "@/lib/access-control";

export const dynamic = "force-dynamic";

export default async function AdminAccountSecurityPage() {
  const context = await requireSchoolMember();
  return <AccountSecurityContent schoolName={context.schoolName} />;
}
