"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { schoolLogoSource } from "@/lib/school-logo";

export function SchoolLogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/settings/logo", { method: "POST", body });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "The school logo could not be uploaded.");
        return;
      }
      setSuccess("School logo uploaded and saved.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The school logo could not be uploaded.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const src = schoolLogoSource(logoUrl);

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
        {src
          ? <Image src={src} unoptimized width={96} height={96} alt="Current school logo" className="h-full w-full object-contain" />
          : <span className="text-xs text-slate-400">No logo uploaded</span>}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold text-slate-900">School logo</h2>
        <p className="text-sm text-slate-500">Upload a PNG, JPEG, or WebP image up to 4 MB. It will appear on the workspace and printed reports.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
          className="block max-w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:font-semibold file:text-violet-700"
        />
        {uploading && <p role="status" className="text-sm text-violet-700">Uploading logo…</p>}
        {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
