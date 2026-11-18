"use client";

import {
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  UsersRound,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const studentNavigation = [
  { href: "/portal/student", label: "Overview", icon: LayoutDashboard },
  { href: "#learning", label: "My learning", icon: GraduationCap },
  { href: "#timetable", label: "Class timetable", icon: CalendarDays },
  { href: "#results", label: "Exam results", icon: BookOpenCheck },
  { href: "#attendance", label: "Attendance", icon: CalendarDays },
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
    >
      {children}
    </PortalShell>
  );
}
