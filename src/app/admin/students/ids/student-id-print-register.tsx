"use client";

import { Check, Printer, Square, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { printCurrentPage } from "@/components/print-button";
import { StudentIdCard, type StudentIdCardRecord } from "@/components/student-id-card";
import styles from "./student-ids.module.css";

export type { StudentIdCardRecord } from "@/components/student-id-card";

type Props = {
  records: StudentIdCardRecord[];
  schoolName: string;
  schoolEmail: string | null;
  schoolLogo: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
};

export function StudentIdPrintRegister({ records, schoolName, schoolEmail, schoolLogo, schoolPhone, schoolAddress }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() => records.map((record) => record.id));
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = records.length > 0 && records.every((record) => selected.has(record.id));
  const selectedRecords = records.filter((record) => selected.has(record.id));
  const lastSelectedId = selectedRecords[selectedRecords.length - 1]?.id;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : records.map((record) => record.id));
  }

  function toggle(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <section className={styles.register}>
      <div className={styles.registerBar}>
        <div><p className={styles.resultCount}><Users size={16} /> {records.length} {records.length === 1 ? "student" : "students"}</p><span className={styles.selectedCount}>{selectedIds.length} selected for printing</span></div>
        <div className={styles.registerActions}>
          <button className={styles.selectButton} type="button" onClick={toggleAll} disabled={!records.length}>
            {allSelected ? <Check size={16} /> : <Square size={16} />}{allSelected ? "Clear selection" : "Select all"}
          </button>
          <button
            className={styles.printButton}
            type="button"
            onClick={() => printCurrentPage({
              targetId: "student-id-card-grid",
              title: "Student ID cards",
              pageOrientation: "landscape",
              pageSize: "ID-1",
            })}
            disabled={!selectedIds.length}
          >
            <Printer size={16} /> Print {selectedIds.length || "selected"} ID cards
          </button>
        </div>
      </div>

      {records.length ? (
        <div id="student-id-card-grid" className={styles.cardGrid}>
          {records.map((record) => {
            const isSelected = selected.has(record.id);
            return (
              <article
                className={styles.cardItem}
                key={record.id}
                data-selected={isSelected}
                data-last-selected={isSelected && record.id === lastSelectedId}
              >
                <label className={styles.cardSelect}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(record.id)} />
                  <span>{isSelected ? "Selected" : "Select card"}</span>
                </label>
                <StudentIdCard record={record} schoolName={schoolName} schoolEmail={schoolEmail} schoolLogo={schoolLogo} schoolPhone={schoolPhone} schoolAddress={schoolAddress} />
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}><Users size={24} /><strong>No students match these filters</strong><span>Try another class, section, status, or search term.</span></div>
      )}
    </section>
  );
}
