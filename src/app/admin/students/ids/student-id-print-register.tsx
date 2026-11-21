"use client";

import Image from "next/image";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Printer,
  Square,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./student-ids.module.css";

export type StudentIdCardRecord = {
  id: number;
  publicId: string;
  name: string;
  admissionNumber: string | null;
  className: string | null;
  sectionName: string | null;
  rollNumber: string | null;
  yearName: string | null;
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
  const idNumber = record.admissionNumber ?? record.rollNumber;
  return (
    <div className={styles.idCard}>
      <div className={styles.cardBorder}>
        <div className={styles.cardTopArt} />
        <div className={styles.cardHeader}>
          <div className={styles.logoFrame}>{schoolLogo ? <Image src={schoolLogo} alt={`${schoolName} logo`} width={42} height={42} unoptimized /> : <span>{schoolName.slice(0, 1).toUpperCase()}</span>}</div>
          <div className={styles.schoolCopy}>
            <h2 className={styles.schoolTitle}>{schoolName}</h2>
            <p className={styles.schoolSubtitle}>{schoolAddress ?? "Student identification card"}</p>
          </div>
        </div>
        <div className={styles.sideTitle}>STUDENT ID CARD</div>
        <div className={styles.studentPortrait}>
          {photoUrl
            ? <Image src={photoUrl} alt={`${record.name} portrait`} fill unoptimized sizes="120px" />
            : <div className={styles.avatarFallback} role="img" aria-label={`${record.name} avatar`}>
                <UserRound aria-hidden="true" size={44} strokeWidth={1.5} />
                <span>{initials}</span>
              </div>}
        </div>
        <div className={styles.studentName}>{record.name}</div>
        <div className={styles.classPill}>GRADE: {classLabel}</div>
        <div className={styles.details}>
          <IdDetail Icon={GraduationCap} label="Faculty" value={classLabel} />
          <IdDetail Icon={MapPin} label="Address" value={record.address} />
          <IdDetail Icon={Phone} label="Contact No." value={record.phone} />
          <IdDetail Icon={CalendarDays} label="Validity" value={record.yearName ?? "Current academic year"} />
          <IdDetail Icon={BadgeCheck} label="ID No." value={idNumber} />
        </div>
        <div className={styles.cardFooter}>
          <div className={styles.principalSignature}>
            <span className={styles.signatureLine} />
            <b>PRINCIPAL</b>
          </div>
          <div className={styles.contactBand}>
            {schoolPhone && <p><Phone size={12} aria-hidden="true" />{schoolPhone}</p>}
            {schoolEmail && <p><Mail size={12} aria-hidden="true" />{schoolEmail}</p>}
            {!schoolPhone && !schoolEmail && <p>Student identification card</p>}
          </div>
        </div>
        <div className={styles.bottomRibbon} />
      </div>
    </div>
  );
}

function IdDetail({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className={styles.detail}>
      <Icon className={styles.detailIcon} size={12} aria-hidden="true" />
      <b>{label}</b>
      <span>:</span>
      <span>{value || "—"}</span>
    </div>
  );
}
