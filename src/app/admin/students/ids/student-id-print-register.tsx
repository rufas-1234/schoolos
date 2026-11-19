"use client";

import Image from "next/image";
import { Check, Printer, Square, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./student-ids.module.css";

export type StudentIdCardRecord = {
  id: number;
  publicId: string;
  name: string;
  admissionNumber: string | null;
  dateOfBirth: string | null;
  className: string | null;
  sectionName: string | null;
  rollNumber: string | null;
  yearName: string | null;
  fatherName: string | null;
  phone: string | null;
  address: string | null;
  photoUrl: string | null;
};

type Props = {
  records: StudentIdCardRecord[];
  schoolName: string;
  schoolLogo: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
};

export function StudentIdPrintRegister({ records, schoolName, schoolLogo, schoolPhone, schoolAddress }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() => records.map((record) => record.id));
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = records.length > 0 && records.every((record) => selected.has(record.id));

  useEffect(() => {
    setSelectedIds(records.map((record) => record.id));
  }, [records]);

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
          <button className={styles.printButton} type="button" onClick={() => window.print()} disabled={!selectedIds.length}>
            <Printer size={16} /> Print {selectedIds.length || "selected"} ID cards
          </button>
        </div>
      </div>

      {records.length ? (
        <div className={styles.cardGrid}>
          {records.map((record) => {
            const isSelected = selected.has(record.id);
            return (
              <article className={styles.cardItem} key={record.id} data-selected={isSelected}>
                <label className={styles.cardSelect}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(record.id)} />
                  <span>{isSelected ? "Selected" : "Select card"}</span>
                </label>
                <StudentIdCard record={record} schoolName={schoolName} schoolLogo={schoolLogo} schoolPhone={schoolPhone} schoolAddress={schoolAddress} />
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

function StudentIdCard({ record, schoolName, schoolLogo, schoolPhone, schoolAddress }: Omit<Props, "records"> & { record: StudentIdCardRecord }) {
  const classLabel = [record.className, record.sectionName].filter(Boolean).join(" · ") || "Student";
  const photoUrl = record.photoUrl;
  return (
    <div className={styles.idCard}>
      <div className={styles.cardBorder}>
        <div className={styles.cardTopArt} />
        <div className={styles.cardHeader}>
          <div className={styles.logoFrame}>{schoolLogo ? <Image src={schoolLogo} alt="" width={42} height={42} unoptimized /> : <span>{schoolName.slice(0, 1).toUpperCase()}</span>}</div>
          <div className={styles.yearTag}>{record.yearName ?? new Date().getFullYear()}</div>
          <div className={styles.schoolCopy}><strong>{schoolName}</strong><span>{schoolAddress ?? "Official student identification"}</span></div>
        </div>
        <h2 className={styles.schoolTitle}>{schoolName}</h2>
        <p className={styles.schoolSubtitle}>{schoolAddress ?? "STUDENT IDENTIFICATION CARD"}</p>
        <div className={styles.studentPortrait}>
          {photoUrl ? <Image src={photoUrl} alt={`${record.name} portrait`} fill unoptimized sizes="120px" /> : <span>{record.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}
        </div>
        <div className={styles.studentName}>{record.name}</div>
        <div className={styles.classPill}>{classLabel}</div>
        <div className={styles.details}>
          <IdDetail label="Admission No." value={record.admissionNumber} />
          <IdDetail label="Father / Guardian" value={record.fatherName} />
          <IdDetail label="Date of Birth" value={record.dateOfBirth ? new Date(`${record.dateOfBirth}T00:00:00`).toLocaleDateString("en-GB") : null} />
          <IdDetail label="Mobile No." value={record.phone} />
          <IdDetail label="Address" value={record.address} />
        </div>
        <div className={styles.cardFooter}>
          <div className={styles.signature}>Authorized<br /><b>Principal</b></div>
          <div className={styles.phoneBadge}><span>☎</span>{schoolPhone ?? record.phone ?? "Student ID"}</div>
        </div>
        <div className={styles.bottomRibbon} />
      </div>
    </div>
  );
}

function IdDetail({ label, value }: { label: string; value: string | null }) {
  return <div className={styles.detail}><b>{label}</b><span>:</span><span>{value || "—"}</span></div>;
}
