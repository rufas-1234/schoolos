import { redirect } from "next/navigation";

export default function LegacyUserRolesPage() {
  redirect("/admin/users/roles");
}
