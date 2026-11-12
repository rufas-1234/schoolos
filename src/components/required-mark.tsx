export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="font-bold text-rose-600">*</span>
      <span className="sr-only"> required</span>
    </>
  );
}
