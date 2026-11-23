"use client";

import Image from "next/image";
import { Check, Printer, Square, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import { printCurrentPage } from "@/components/print-button";
import { ExamAccessCard, type ExamCardRecord } from "@/components/exam-access-card";
import {
  approveExamFeeException,
  type ExamFeeClearanceState,
} from "../../exam-card-actions";
import styles from "./exam-cards.module.css";

export type { ExamCardRecord } from "@/components/exam-access-card";

type Props = {
  examId: number;
  examName: string;
  examYear: string;
  examStartDate: string;
  examEndDate: string;
  records: ExamCardRecord[];
  schoolName: string;
  schoolLogo: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
};

const initialState: ExamFeeClearanceState = {};

export function ExamCardRegister({
  examId,
  examName,
  examYear,
  examStartDate,
  examEndDate,
  records,
  schoolName,
  schoolLogo,
  schoolAddress,
  schoolPhone,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>(
    () => records.filter((record) => record.eligibility !== "fees-outstanding").map((record) => record.id),
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const eligibleRecords = records.filter((record) => record.eligibility !== "fees-outstanding");
  const allSelected = eligibleRecords.length > 0 && eligibleRecords.every((record) => selected.has(record.id));
  const lastSelectedId = records.filter((record) => selected.has(record.id)).at(-1)?.id;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : eligibleRecords.map((record) => record.id));
  }

  function toggle(id: number) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  return (
    <section className={styles.register}>
      <div className={styles.registerBar}>
        <div>
          <p className={styles.resultCount}><Users size={16} /> {records.length} {records.length === 1 ? "student" : "students"}</p>
          <span className={styles.selectedCount}>{selectedIds.length} eligible cards selected</span>
        </div>
        <div className={styles.registerActions}>
          <button className={styles.selectButton} type="button" onClick={toggleAll} disabled={!eligibleRecords.length}>
            {allSelected ? <Check size={16} /> : <Square size={16} />}
            {allSelected ? "Clear selection" : "Select all eligible"}
          </button>
          <button
            className={styles.printButton}
            type="button"
            onClick={() => printCurrentPage({
              targetId: "exam-access-card-grid",
              title: `${examName} exam access cards`,
              pageOrientation: "landscape",
              pageSize: "ID-1",
            })}
            disabled={!selectedIds.length}
          >
            <Printer size={16} /> Print {selectedIds.length || "selected"} cards
          </button>
        </div>
      </div>

      <div id="exam-access-card-grid" className={styles.cardGrid}>
        {records.map((record) => {
          const isEligible = record.eligibility !== "fees-outstanding";
          const isSelected = selected.has(record.id);
          return (
            <article
              className={styles.cardItem}
              key={record.id}
              data-selected={isSelected}
              data-last-selected={isSelected && record.id === lastSelectedId}
            >
              {isEligible ? (
                <label className={styles.cardSelect}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(record.id)} />
                  <span>{isSelected ? "Selected for printing" : "Select card"}</span>
                </label>
              ) : (
                <div className={styles.blockedLabel}>Not eligible · {record.outstandingInvoiceCount} unpaid invoice{record.outstandingInvoiceCount === 1 ? "" : "s"}</div>
              )}
              {isEligible ? (
                <ExamAccessCard
                  record={record}
                  examName={examName}
                  examYear={examYear}
                  examStartDate={examStartDate}
                  examEndDate={examEndDate}
                  schoolName={schoolName}
                  schoolLogo={schoolLogo}
                  schoolAddress={schoolAddress}
                  schoolPhone={schoolPhone}
                />
              ) : (
                <div className={styles.blockedCard}>
                  <StudentIdentity record={record} />
                  <p className={styles.balanceNotice}>A recorded reason approved by a school administrator is required before printing this student&apos;s exam card.</p>
                </div>
              )}
              {(record.eligibility === "fees-outstanding" || record.eligibility === "approved-exception") && (
                <ExceptionForm
                  examId={examId}
                  enrollmentId={record.id}
                  existingReason={record.clearanceReason}
                />
              )}
            </article>
          );
        })}
      </div>

      {!records.length && <div className={styles.emptyState}>No students match these filters.</div>}
    </section>
  );
}
function StudentIdentity({ record }: { record: ExamCardRecord }) {
  return (
    <div className={styles.blockedIdentity}>
      <div className={styles.blockedPortrait}>
        {record.photoUrl
          ? <Image src={record.photoUrl} alt="" fill sizes="70px" unoptimized />
          : <UserRound size={30} aria-hidden="true" />}
      </div>
      <div>
        <h2>{record.name}</h2>
        <p>{record.className}{record.sectionName ? ` · ${record.sectionName}` : ""}</p>
        <p>Admission no. {record.admissionNumber || "—"} · Roll no. {record.rollNumber || "—"}</p>
      </div>
    </div>
  );
}

function ExceptionForm({
  examId,
  enrollmentId,
  existingReason,
}: {
  examId: number;
  enrollmentId: number;
  existingReason: string | null;
}) {
  const [state, action, pending] = useActionState(approveExamFeeException, initialState);
  return (
    <form action={action} className={styles.exceptionForm}>
      <input type="hidden" name="examinationId" value={examId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <label>
        {existingReason ? "Approved exception reason" : "Reason to allow exam sitting"}
        <textarea
          name="reason"
          defaultValue={existingReason ?? ""}
          minLength={10}
          maxLength={1000}
          required
          placeholder="For example, approved payment plan or verified financial hardship."
          rows={3}
        />
      </label>
      <p className={styles.exceptionHint}>
        Approval is recorded with the administrator and can be audited. The reason is not printed on the card.
      </p>
      {state.error && <p role="alert" className={styles.formError}>{state.error}</p>}
      {state.success && <p role="status" className={styles.formSuccess}>{state.success}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : existingReason ? "Update approval reason" : "Approve exam access"}
      </button>
    </form>
  );
}
