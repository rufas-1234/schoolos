"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type SignatureRole = "headteacher" | "class-teacher" | "subject-teacher";

const roleLabels: Record<SignatureRole, string> = {
  headteacher: "Headteacher",
  "class-teacher": "Class teacher",
  "subject-teacher": "Subject teacher",
};

export function SignatureForm({
  role,
  version,
}: {
  role: SignatureRole;
  version?: number;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch(`/api/admin/examinations/signatures/${role}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json() as { error?: string; success?: boolean };
      if (!response.ok || !result.success) {
        setError(result.error ?? "The signature could not be uploaded.");
        return;
      }
      setMessage(`${roleLabels[role]} signature uploaded.`);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("The signature could not be uploaded. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <article className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold text-slate-950">{roleLabels[role]}</h2>
    <p className="mt-1 text-sm text-slate-600">Upload a PNG, JPEG, or WebP image up to 4 MB.</p>
    {version !== undefined && <div className="my-4 flex h-20 items-center rounded-lg border border-dashed border-slate-200 p-3">
      <Image src={`/api/admin/examinations/signatures/${role}?v=${version}`} unoptimized width={220} height={72}
        alt={`${roleLabels[role]} signature`} className="max-h-16 w-auto max-w-full object-contain" />
    </div>}
    <form onSubmit={submit} className="mt-4 space-y-3">
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-700" />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <button disabled={pending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Uploading..." : version !== undefined ? "Replace signature" : "Upload signature"}
      </button>
    </form>
  </article>;
}
