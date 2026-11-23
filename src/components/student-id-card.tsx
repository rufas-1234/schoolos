import Image from "next/image";
import { UserRound } from "lucide-react";
import styles from "@/app/admin/students/ids/student-ids.module.css";

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
  record: StudentIdCardRecord;
  schoolName: string;
  schoolEmail: string | null;
  schoolLogo: string | null;
  schoolPhone: string | null;
  schoolAddress: string | null;
};

export function StudentIdCard({
  record,
  schoolName,
  schoolEmail,
  schoolLogo,
  schoolPhone,
  schoolAddress,
}: Props) {
  const classLabel = [record.className, record.sectionName].filter(Boolean).join(" · ") || "Student";
  const initials = record.name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={styles.idCard}>
      <div className={styles.cardBorder}>
        <div className={styles.cardTopArt} />
        <div className={styles.cardHeader}>
          <div className={styles.logoFrame}>
            {schoolLogo
              ? <Image src={schoolLogo} alt={`${schoolName} logo`} width={42} height={42} loading="lazy" fetchPriority="low" decoding="async" unoptimized />
              : <span>{schoolName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className={styles.schoolCopy}>
            <h2 className={styles.schoolTitle}>{schoolName}</h2>
            <p className={styles.schoolSubtitle}>{schoolAddress ?? "STUDENT IDENTIFICATION CARD"}</p>
          </div>
          <div className={styles.yearTag}>{record.yearName ?? new Date().getFullYear()}</div>
        </div>
        <svg className={styles.planeMark} viewBox="0 0 84 72" aria-hidden="true">
          <path d="M4 10 79 2 38 34 4 10Z" fill="#c4b5fd" stroke="#1e1b4b" strokeWidth="2.2" />
          <path d="m4 10 34 24 9 32 9-43L4 10Z" fill="#7c3aed" stroke="#1e1b4b" strokeWidth="2.2" />
          <path d="m38 34 41-32-23 21-9 43-9-32Z" fill="#e0e7ff" stroke="#1e1b4b" strokeWidth="2.2" />
          <path d="m14 15 47 7-23 12" fill="none" stroke="#fff" strokeWidth="2" opacity=".8" />
        </svg>
        <div className={styles.cardBody}>
          <div className={styles.studentPortrait}>
            {record.photoUrl
              ? <Image src={record.photoUrl} alt={`${record.name} portrait`} fill loading="lazy" fetchPriority="low" decoding="async" unoptimized sizes="120px" />
              : <div className={styles.avatarFallback} role="img" aria-label={`${record.name} avatar`}>
                  <UserRound aria-hidden="true" size={44} strokeWidth={1.5} />
                  <span>{initials}</span>
                </div>}
          </div>
          <div className={styles.studentInfo}>
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
          </div>
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
