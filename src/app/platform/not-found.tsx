import Link from "next/link";
import { ArrowLeft, CircleHelp } from "lucide-react";

export default function PlatformNotFound() {
  return <main className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-5 py-12 text-slate-900"><section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><CircleHelp size={26}/></span><p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-violet-700">SchoolOS system message</p><h1 className="mt-2 text-2xl font-bold">Platform page not available</h1><p className="mt-3 text-sm leading-6 text-slate-600">This platform page may have moved, or its address may be incorrect. Return to platform workspaces to continue.</p><Link href="/platform/schools" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><ArrowLeft size={16}/> Platform workspaces</Link></section></main>;
}
