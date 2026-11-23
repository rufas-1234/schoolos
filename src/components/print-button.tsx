"use client";

import QRCode from "qrcode";

type PrintOptions = {
  title?: string;
  targetId?: string;
  pageOrientation?: "portrait" | "landscape";
  pageSize?: "A4" | "ID-1";
  pageMargin?: string;
};

const printHiddenAttribute = "data-print-hidden";
const printStructureAttribute = "data-print-structure";
const printTargetAttribute = "data-print-target";

export async function printCurrentPage({
  title,
  targetId,
  pageOrientation = "portrait",
  pageSize = "A4",
  pageMargin,
}: PrintOptions = {}) {
  const target = targetId
    ? document.getElementById(targetId)
    : document.querySelector<HTMLElement>(".fee-receipt-page")
      ?? document.querySelector<HTMLElement>(".print-report-content")
      ?? document.querySelector<HTMLElement>(".admin-data-table")
      ?? document.querySelector<HTMLElement>("main");
  if (targetId && !target) {
    window.alert("The selected report content could not be found. Refresh the page and try again.");
    return;
  }
  if (!target) {
    window.alert("Printable report content could not be found. Refresh the page and try again.");
    return;
  }

  const qrValue = new URL(window.location.pathname, window.location.origin).toString();
  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    });
  } catch (error) {
    console.error("Could not generate the print QR code.", error);
    window.alert("The QR code could not be generated, so this report was not printed. Please try again.");
    return;
  }
  const qrStamps: HTMLElement[] = [];
  const qrImages: HTMLImageElement[] = [];
  for (const qrTarget of getQrTargets(target, pageSize)) {
    const stamp = document.createElement("div");
    stamp.className = "print-qr-stamp";
    const image = document.createElement("img");
    image.src = qrDataUrl;
    image.alt = "QR code to open this school record online";
    stamp.append(image);
    if (pageSize !== "ID-1") {
      const label = document.createElement("span");
      label.textContent = "Scan to open online";
      stamp.append(label);
    }
    const qrHost = qrTarget.querySelector<HTMLElement>("[data-print-qr-header]") ?? qrTarget;
    qrHost.append(stamp);
    qrStamps.push(stamp);
    qrImages.push(image);
  }
  try {
    await Promise.all(qrImages.map((image) => image.decode()));
  } catch (error) {
    for (const stamp of qrStamps) stamp.remove();
    console.error("Could not load the generated print QR code.", error);
    window.alert("The QR code could not be loaded, so this report was not printed. Please try again.");
    return;
  }

  const printHeader = document.querySelector<HTMLElement>(".admin-print-header");
  const printFooter = document.querySelector<HTMLElement>(".admin-print-footer");
  const isExamReport = Boolean(target.closest(".exam-report-document"));
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
  const rootWasDark = document.documentElement.classList.contains("dark");
  const bodyWasDark = document.body.classList.contains("dark");
  const previousPrintPageSize = document.body.getAttribute("data-print-page-size");
  const previousPrintOrientation = document.body.getAttribute("data-print-orientation");
  const pageStyle = document.createElement("style");
  pageStyle.dataset.adminPrintPage = "true";
  const pageSizeRule = pageSize === "ID-1" ? "85.6mm 53.98mm" : `${pageSize} ${pageOrientation}`;
  const pageMargins = pageSize === "ID-1" ? "0" : isExamReport ? "5mm" : pageMargin ?? "27mm 14mm 20mm";
  pageStyle.textContent = `@page { size: ${pageSizeRule}; margin: ${pageMargins}; }`;
  document.head.append(pageStyle);
  document.documentElement.classList.remove("dark");
  document.body.classList.remove("dark");
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
    for (const stamp of qrStamps) stamp.remove();
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
    if (rootWasDark) document.documentElement.classList.add("dark");
    if (bodyWasDark) document.body.classList.add("dark");
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

function getQrTargets(target: HTMLElement, pageSize: "A4" | "ID-1"): HTMLElement[] {
  if (pageSize === "ID-1") {
    const cardHosts = [
      ...(target.matches("[data-print-qr-host]") ? [target] : []),
      ...target.querySelectorAll<HTMLElement>("[data-print-qr-host]"),
    ];
    return cardHosts.length ? cardHosts : [target];
  }

  const documentTargets = [
    ...(target.matches("[data-print-qr-document]") ? [target] : []),
    ...target.querySelectorAll<HTMLElement>("[data-print-qr-document]"),
  ];
  return documentTargets.length ? documentTargets : [target];
}

export function printElementById(
  elementId: string,
  title: string,
  pageOrientation?: "portrait" | "landscape",
  pageSize?: "A4" | "ID-1",
) {
  printCurrentPage({ targetId: elementId, title, pageOrientation, pageSize });
}

export function PrintButton({
  label = "Print / Save PDF",
  targetId,
  pageOrientation,
  pageSize,
  pageMargin,
  disabled = false,
}: {
  label?: string;
  targetId?: string;
  pageOrientation?: "portrait" | "landscape";
  pageSize?: "A4" | "ID-1";
  pageMargin?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => printCurrentPage({ targetId, title: label, pageOrientation, pageSize, pageMargin })}
      className="print:hidden rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
