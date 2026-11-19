"use client";

import Image from "next/image";
import { Check, Printer, Square, UserRound, Users } from "lucide-react";
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
  motherName: string | null;
  phone: string | null;
  address: string | null;
  photoUrl: string | null;
};

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

function StudentIdCard({ record, schoolName, schoolEmail, schoolLogo, schoolPhone, schoolAddress }: Omit<Props, "records"> & { record: StudentIdCardRecord }) {
  const classLabel = [record.className, record.sectionName].filter(Boolean).join(" · ") || "Student";
  const photoUrl = record.photoUrl;
  const initials = record.name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={styles.idCard}>
      <div className={styles.cardBorder}>
        <div className={styles.cardTopArt} />
        <div className={styles.cardHeader}>
          <div className={styles.logoFrame}>{schoolLogo ? <Image src={schoolLogo} alt={`${schoolName} logo`} width={42} height={42} unoptimized /> : <span>{schoolName.slice(0, 1).toUpperCase()}</span>}</div>
          <div className={styles.yearTag}>{record.yearName ?? new Date().getFullYear()}</div>
          <div className={styles.schoolCopy}><strong>{schoolName}</strong><span>{schoolAddress ?? "Official student identification"}</span></div>
        </div>
        <svg className={styles.planeMark} viewBox="0 0 84 72" aria-hidden="true">
          <path d="M4 10 79 2 38 34 4 10Z" fill="#f5d837" stroke="#28242a" strokeWidth="2.2" />
          <path d="m4 10 34 24 9 32 9-43L4 10Z" fill="#22a9df" stroke="#28242a" strokeWidth="2.2" />
          <path d="m38 34 41-32-23 21-9 43-9-32Z" fill="#f8e54b" stroke="#28242a" strokeWidth="2.2" />
          <path d="m14 15 47 7-23 12" fill="none" stroke="#fff" strokeWidth="2" opacity=".8" />
        </svg>
        <h2 className={styles.schoolTitle}>{schoolName}</h2>
        <p className={styles.schoolSubtitle}>{schoolAddress ?? "STUDENT IDENTIFICATION CARD"}</p>
        <div className={styles.studentPortrait}>
          {photoUrl
            ? <Image src={photoUrl} alt={`${record.name} portrait`} fill unoptimized sizes="120px" />
            : <div className={styles.avatarFallback} role="img" aria-label={`${record.name} avatar`}>
                <UserRound aria-hidden="true" size={44} strokeWidth={1.5} />
                <span>{initials}</span>
              </div>}
        </div>
        <div className={styles.studentName}>{record.name}</div>
        <div className={styles.classPill}>{classLabel}</div>
        <div className={styles.details}>
          <IdDetail label="Admission No." value={record.admissionNumber} />
          <IdDetail label="Father Name" value={record.fatherName} />
          <IdDetail label="Mother Name" value={record.motherName} />
          <IdDetail label="Date of Birth" value={record.dateOfBirth ? new Date(`${record.dateOfBirth}T00:00:00`).toLocaleDateString("en-GB") : null} />
          <IdDetail label="Mobile No." value={record.phone} />
          <IdDetail label="Address" value={record.address} />
          <IdDetail label="School Email" value={schoolEmail} wrapValue />
        </div>
        <div className={styles.cardFooter}>
          <div className={styles.signature}><span>Authorized signature</span><b>Principal</b></div>
          <div className={styles.phoneBadge}><span aria-hidden="true">☎</span>{record.phone ?? schoolPhone ?? "Student ID"}</div>
        </div>
        <div className={styles.watermark} aria-hidden="true"><span>✦</span></div>
        <div className={styles.bottomRibbon} />
      </div>
    </div>
  );
}

function IdDetail({ label, value, wrapValue = false }: { label: string; value: string | null; wrapValue?: boolean }) {
  return <div className={styles.detail}><b>{label}</b><span>:</span><span className={wrapValue ? styles.detailValueWrap : undefined}>{value || "—"}</span></div>;
}
