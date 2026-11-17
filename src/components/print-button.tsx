"use client";

type PrintOptions = {
  title?: string;
  targetId?: string;
  pageOrientation?: "portrait" | "landscape";
  pageSize?: "A4";
};

const printHiddenAttribute = "data-print-hidden";
const printStructureAttribute = "data-print-structure";
const printTargetAttribute = "data-print-target";

export function printCurrentPage({
  title,
  targetId,
  pageOrientation = "portrait",
  pageSize = "A4",
}: PrintOptions = {}) {
  const target = targetId ? document.getElementById(targetId) : null;
  if (targetId && !target) {
    window.alert("The selected report content could not be found. Refresh the page and try again.");
    return;
  }

  const printHeader = document.querySelector<HTMLElement>(".admin-print-header");
  const printFooter = document.querySelector<HTMLElement>(".admin-print-footer");
  const isExamReport = Boolean(target?.closest(".exam-report-document"));
  const retainedRoots = [
    target,
    ...(isExamReport ? [] : [printHeader, printFooter]),
  ].filter((element): element is HTMLElement => element !== null);
  const changedAttributes: Array<{
    element: HTMLElement;
    hidden: string | null;
    structure: string | null;
    target: string | null;
  }> = [];
  const previousTitle = document.title;
  const previousPrintPageSize = document.body.getAttribute("data-print-page-size");
  const previousPrintOrientation = document.body.getAttribute("data-print-orientation");
  const pageStyle = document.createElement("style");
  pageStyle.dataset.adminPrintPage = "true";
  pageStyle.textContent = `@page { size: ${pageSize} ${pageOrientation}; margin: ${isExamReport ? "5mm" : "27mm 14mm 20mm"}; }`;
  document.head.append(pageStyle);
  document.body.classList.add("print-target-active");
  if (isExamReport) document.body.classList.add("print-exam-report");
  document.body.setAttribute("data-print-page-size", pageSize);
  document.body.setAttribute("data-print-orientation", pageOrientation);

  if (target) {
    const heading = target.querySelector(".exam-report-heading h2, .print-report-heading h2, .payroll-record-print-kicker, h1, h2");
    document.title = heading?.textContent?.trim() || title || previousTitle;

    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const isRetained = retainedRoots.some((root) => root === element || root.contains(element));
      const containsRetainedRoot = retainedRoots.some((root) => element.contains(root));
      if (!isRetained && !containsRetainedRoot) {
        changedAttributes.push({
          element,
          hidden: element.getAttribute(printHiddenAttribute),
          structure: element.getAttribute(printStructureAttribute),
          target: element.getAttribute(printTargetAttribute),
        });
        element.setAttribute(printHiddenAttribute, "true");
      } else if (containsRetainedRoot && element !== document.body) {
        changedAttributes.push({
          element,
          hidden: element.getAttribute(printHiddenAttribute),
          structure: element.getAttribute(printStructureAttribute),
          target: element.getAttribute(printTargetAttribute),
        });
        element.setAttribute(printStructureAttribute, "true");
      }
    }

    const oldTargetAttribute = target.getAttribute(printTargetAttribute);
    if (!changedAttributes.some((change) => change.element === target)) {
      changedAttributes.push({
        element: target,
        hidden: target.getAttribute(printHiddenAttribute),
        structure: target.getAttribute(printStructureAttribute),
        target: oldTargetAttribute,
      });
    }
    target.setAttribute(printTargetAttribute, "true");
  } else {
    const heading = document.querySelector("main h1, main h2");
    document.title = heading?.textContent?.trim() || title || previousTitle;
  }

  const restore = () => {
    window.removeEventListener("afterprint", restore);
    for (const change of changedAttributes) {
      if (change.hidden === null) change.element.removeAttribute(printHiddenAttribute);
      else change.element.setAttribute(printHiddenAttribute, change.hidden);
      if (change.structure === null) change.element.removeAttribute(printStructureAttribute);
      else change.element.setAttribute(printStructureAttribute, change.structure);
      if (change.target === null) change.element.removeAttribute(printTargetAttribute);
      else change.element.setAttribute(printTargetAttribute, change.target);
    }
    document.body.classList.remove("print-target-active");
    document.body.classList.remove("print-exam-report");
    if (previousPrintPageSize === null) document.body.removeAttribute("data-print-page-size");
    else document.body.setAttribute("data-print-page-size", previousPrintPageSize);
    if (previousPrintOrientation === null) document.body.removeAttribute("data-print-orientation");
    else document.body.setAttribute("data-print-orientation", previousPrintOrientation);
    document.title = previousTitle;
    pageStyle.remove();
  };

  window.addEventListener("afterprint", restore);
  window.print();
}

export function printElementById(
  elementId: string,
  title: string,
  pageOrientation?: "portrait" | "landscape",
  pageSize?: "A4",
) {
  printCurrentPage({ targetId: elementId, title, pageOrientation, pageSize });
}

export function PrintButton({
  label = "Print / Save PDF",
  targetId,
  pageOrientation,
  pageSize,
  disabled = false,
}: {
  label?: string;
  targetId?: string;
  pageOrientation?: "portrait" | "landscape";
  pageSize?: "A4";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => printCurrentPage({ targetId, title: label, pageOrientation, pageSize })}
      className="print:hidden rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
