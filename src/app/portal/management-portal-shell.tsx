"use client";

import {
  BedDouble,
  BookMarked,
  BookOpenCheck,
  ClipboardList,
  LayoutDashboard,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const libraryNavigation = [
  { href: "/portal/library", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/library?section=circulation", label: "Issue / return", icon: ReceiptText },
  { href: "/admin/library?section=books", label: "Book catalog", icon: BookOpenCheck },
  { href: "/admin/library?section=members", label: "Library members", icon: UsersRound },
  { href: "/admin/library?section=issued", label: "Loan register", icon: ClipboardList },
  { href: "/admin/library?section=categories", label: "Catalog setup", icon: BookMarked },
];

const dormitoryNavigation = [
  { href: "/portal/dormitories", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/dormitories?section=residents", label: "Room assignments", icon: UsersRound },
  { href: "/admin/dormitories?section=dormitories", label: "Dormitories", icon: BedDouble },
  { href: "/admin/dormitories?section=rooms", label: "Rooms & beds", icon: ClipboardList },
  { href: "/admin/dormitories/reports", label: "Reports", icon: BookOpenCheck },
];

export function ManagementPortalShell({
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
  portalType: "library" | "dormitory";
}) {
  const isLibrary = portalType === "library";

  return (
    <PortalShell
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      userName={userName}
      portalLabel={isLibrary ? "Library Portal" : "Dormitory Portal"}
      navigation={isLibrary ? libraryNavigation : dormitoryNavigation}
    >
      {children}
    </PortalShell>
  );
}
