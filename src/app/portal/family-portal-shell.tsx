"use client";

import {
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const studentNavigation = [
  { href: "/portal/student?section=overview", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/student?section=learning", label: "My learning", icon: GraduationCap },
  { href: "/portal/student?section=timetable", label: "Class timetable", icon: CalendarDays },
  { href: "/portal/student?section=results", label: "Exam results", icon: BookOpenCheck },
  { href: "/portal/student?section=fees", label: "Invoices and fees", icon: CreditCard },
  { href: "/portal/student?section=receipts", label: "Payment receipts", icon: ReceiptText },
  { href: "/portal/student?section=profile", label: "My profile", icon: UsersRound },
  { href: "/portal/student?section=library", label: "Library", icon: BookOpenCheck },
  { href: "/portal/student?section=attendance", label: "Attendance", icon: CalendarDays },
];

const parentNavigation = [
  { href: "/portal/parent", label: "Overview", icon: LayoutDashboard },
  { href: "#children", label: "My children", icon: UsersRound },
  { href: "#progress", label: "Academic progress", icon: BookOpenCheck },
  { href: "#fees", label: "Fee invoices", icon: CreditCard },
  { href: "#attendance", label: "Attendance", icon: CalendarDays },
];

export function FamilyPortalShell({
  children,
  schoolName,
  schoolLogoUrl,
  userName,
  portalType,
}: {
  children: React.ReactNode;
  schoolName: string;
  schoolLogoUrl: string | null;
  userName: string;
  portalType: "student" | "parent";
}) {
  const isStudent = portalType === "student";

  return (
    <PortalShell
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      userName={userName}
      portalLabel={isStudent ? "Student Portal" : "Parent Portal"}
      navigation={isStudent ? studentNavigation : parentNavigation}
      searchScope={isStudent ? "student" : undefined}
    >
      {children}
    </PortalShell>
  );
}
