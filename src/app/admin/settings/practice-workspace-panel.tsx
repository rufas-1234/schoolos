"use client";

import { useActionState } from "react";
import { selectSchool } from "@/app/select-school/actions";
import {
  finishPracticeWorkspace,
  resetPracticeWorkspace,
  startPracticeWorkspace,
  type PracticeWorkspaceActionState,
} from "./practice-actions";

const buttonClass = "rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60";

function ActionError({ state }: { state: PracticeWorkspaceActionState }) {
  return state.error ? <p role="alert" className="mt-2 text-sm text-rose-700">{state.error}</p> : null;
}

export function PracticeWorkspacePanel({
  isPracticeWorkspace,
  activePracticeWorkspacePublicId,
}: {
  isPracticeWorkspace: boolean;
  activePracticeWorkspacePublicId: string | null;
}) {
  const [startState, startAction, startPending] = useActionState<PracticeWorkspaceActionState, FormData>(
    startPracticeWorkspace,
    {},
  );
  const [resetState, resetAction, resetPending] = useActionState<PracticeWorkspaceActionState, FormData>(
    resetPracticeWorkspace,
    {},
  );
  const [finishState, finishAction, finishPending] = useActionState<PracticeWorkspaceActionState, FormData>(
    finishPracticeWorkspace,
    {},
  );

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm sm:p-7">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Practice mode</p>
      {isPracticeWorkspace ? (
        <>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">You are in an isolated practice workspace</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Records created here are separate from your live school. Reset permanently deletes this workspace and creates a fresh one.
            Finishing permanently deletes it and returns you to the live school. These deletions cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form
              action={resetAction}
              onSubmit={(event) => {
                if (!window.confirm("Permanently delete this practice workspace and all its records and files, then create a clean one? This cannot be undone. Your live school will not be changed.")) {
                  event.preventDefault();
                }
              }}
            >
              <button type="submit" disabled={resetPending} className={buttonClass}>
                {resetPending ? "Resetting…" : "Reset practice"}
              </button>
            </form>
            <form
              action={finishAction}
              onSubmit={(event) => {
                if (!window.confirm("Permanently delete this practice workspace and all its records and files, then return to your live school? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
            >
              <button type="submit" disabled={finishPending} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                {finishPending ? "Finishing…" : "Finish practice"}
              </button>
            </form>
          </div>
          <ActionError state={resetState} />
          <ActionError state={finishState} />
        </>
      ) : activePracticeWorkspacePublicId ? (
        <>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Your practice workspace is ready</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            It is separate from live school records. School administrators can use it to explore the system and create training records.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={selectSchool}>
              <input type="hidden" name="schoolPublicId" value={activePracticeWorkspacePublicId} />
              <button type="submit" className={buttonClass}>Open practice workspace</button>
            </form>
            <form
              action={resetAction}
              onSubmit={(event) => {
                if (!window.confirm("Permanently delete the practice workspace and all its records and files, then create a clean one? This cannot be undone. Your live school will not be changed.")) {
                  event.preventDefault();
                }
              }}
            >
              <button type="submit" disabled={resetPending} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                {resetPending ? "Resetting…" : "Reset practice"}
              </button>
            </form>
            <form
              action={finishAction}
              onSubmit={(event) => {
                if (!window.confirm("Permanently delete the practice workspace and all its records and files, then return to your live school? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
            >
              <button type="submit" disabled={finishPending} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                {finishPending ? "Finishing…" : "Finish practice"}
              </button>
            </form>
          </div>
          <ActionError state={resetState} />
          <ActionError state={finishState} />
        </>
      ) : (
        <>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Try SchoolOS in a separate workspace</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Create a clean practice workspace with separate operational records. It copies only basic school contact, currency, and timezone settings; student, staff, finance, and other operational records are not copied.
            Users with School profile management permission can create and manage it.
          </p>
          <form action={startAction} className="mt-4">
            <button type="submit" disabled={startPending} className={buttonClass}>
              {startPending ? "Creating practice workspace…" : "Start practice mode"}
            </button>
          </form>
          <ActionError state={startState} />
        </>
      )}
    </section>
  );
}
