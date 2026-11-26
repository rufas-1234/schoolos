"use client";

import {
  BedDouble,
  BookMarked,
  BookOpenCheck,
  ClipboardList,
  CircleDollarSign,
  LayoutDashboard,
  PackageOpen,
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

const financeOverview = { href: "/portal/finance", label: "Overview", icon: LayoutDashboard };

function financeNavigation(permissions: readonly string[]) {
  const canManageFees = permissions.includes("fees.manage") || permissions.includes("payments.record");
  const canManageAccounts = permissions.includes("accounts.manage");
  const canManageInventory = permissions.includes("inventory.manage");
  return [
    financeOverview,
    ...(canManageFees
      ? [
        { href: "/admin/fees/collection", label: "Fee collection", icon: CircleDollarSign },
        { href: "/admin/fees/reports", label: "Fee reports", icon: ReceiptText },
      ]
      : []),
    ...(canManageAccounts
      ? [
        { href: "/admin/accounts?section=profit", label: "Profit & loss", icon: BookOpenCheck },
        { href: "/admin/accounts?section=income", label: "Other income", icon: ReceiptText },
        { href: "/admin/accounts?section=expenses", label: "Expenses", icon: ClipboardList },
        { href: "/admin/accounts?section=bank", label: "Bank accounts", icon: CircleDollarSign },
        { href: "/admin/accounts?section=reports", label: "Accounts reports", icon: BookMarked },
      ]
      : []),
    ...(canManageInventory
      ? [{ href: "/admin/inventory", label: "Inventory & assets", icon: PackageOpen }]
      : []),
  ];
}

export function ManagementPortalShell({
  children,
  adminMode = false,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  userName,
  portalType,
  permissions = [],
  academicYears,
  selectedAcademicYearId,
}: {
  children: React.ReactNode;
  adminMode?: boolean;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  userName: string;
  portalType: "library" | "dormitory" | "finance";
  permissions?: readonly string[];
  academicYears?: { id: number; name: string }[];
  selectedAcademicYearId?: number | null;
}) {
  const portalLabel = {
    library: "Library Portal",
    dormitory: "Dormitory Portal",
    finance: "Finance Portal",
  }[portalType];
  const navigation = portalType === "library"
    ? libraryNavigation
    : portalType === "dormitory"
      ? dormitoryNavigation
      : financeNavigation(permissions);

  if (adminMode) return <>{children}</>;

  return (
    <PortalShell
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      schoolAddress={schoolAddress}
      schoolPhone={schoolPhone}
      schoolEmail={schoolEmail}
      userName={userName}
      portalLabel={portalLabel}
      navigation={navigation}
      academicYears={academicYears}
      selectedAcademicYearId={selectedAcademicYearId}
    >
      {children}
    </PortalShell>
  );
}
