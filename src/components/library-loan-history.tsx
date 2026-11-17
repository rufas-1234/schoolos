export type LibraryLoanHistoryItem = {
  id: number;
  bookTitle: string;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
  status: string;
};

export function LibraryLoanHistory({
  loans,
}: {
  loans: LibraryLoanHistoryItem[];
}) {
  return loans.length ? (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5">Book</th>
            <th className="px-3 py-2.5">Issued</th>
            <th className="px-3 py-2.5">Due</th>
            <th className="px-3 py-2.5">Returned</th>
            <th className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td className="px-3 py-3 font-medium text-slate-900">{loan.bookTitle}</td>
              <td className="px-3 py-3 text-slate-600">{loan.issuedAt}</td>
              <td className="px-3 py-3 text-slate-600">{loan.dueDate}</td>
              <td className="px-3 py-3 text-slate-600">{loan.returnedAt ?? "—"}</td>
              <td className="px-3 py-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  loan.status === "active"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-emerald-50 text-emerald-800"
                }`}>
                  {loan.status === "active" ? "Borrowed" : "Returned"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      No library borrowing history is recorded.
    </p>
  );
}
