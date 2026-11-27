"use client";

import { useActionState } from "react";
import { assignTransportDriver, type TransportActionState } from "./actions";

export function DriverAssignmentForm({
  routes,
  drivers,
}: {
  routes: { id: number; label: string }[];
  drivers: { id: number; label: string }[];
}) {
  const [state, action, pending] = useActionState<TransportActionState, FormData>(assignTransportDriver, {});

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="space-y-1.5 text-sm font-medium text-slate-700">
        Route
        <select name="routeId" required defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Select a route</option>
          {routes.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}
        </select>
      </label>
      <label className="space-y-1.5 text-sm font-medium text-slate-700">
        Driver
        <select name="driverId" defaultValue="" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Unassigned</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}
        </select>
      </label>
      <button disabled={pending || routes.length === 0} className="h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Assign driver"}
      </button>
      {state.error && <p role="alert" className="text-sm text-rose-700 sm:col-span-3">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700 sm:col-span-3">{state.success}</p>}
    </form>
  );
}
