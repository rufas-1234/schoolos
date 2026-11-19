export function isPlatformAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const allowedEmails = new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowedEmails.has(email.trim().toLowerCase());
}
