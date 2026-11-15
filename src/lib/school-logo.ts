export function schoolLogoSource(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  return logoUrl.startsWith("https://") ? logoUrl : "/api/admin/settings/logo";
}
