"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function PlatformSignOutButton() {
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
    <div className="text-right">
      <button onClick={signOut} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        Sign out
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
