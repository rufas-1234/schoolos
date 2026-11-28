"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function PlatformSignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message ?? "Sign out failed. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign out failed. Please try again.");
    }
  }

  return (
    <div className={compact ? "flex justify-center" : "text-right"}>
      <button onClick={signOut} title={compact ? "Sign out" : undefined} aria-label="Sign out" className={compact ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100" : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"}>
        {compact ? <LogOut size={17} aria-hidden="true" /> : "Sign out"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
