import Image from "next/image";
import { UserRound } from "lucide-react";
import styles from "@/app/admin/examinations/[examId]/cards/exam-cards.module.css";

export type ExamCardRecord = {
  id: number;
  publicId: string;
  name: string;
  admissionNumber: string | null;
  rollNumber: string | null;
  className: string;
  sectionName: string;
  photoUrl: string | null;
  eligibility: "fees-cleared" | "approved-exception" | "fees-outstanding";
  invoiceCount: number;
  outstandingInvoiceCount: number;
  clearanceReason: string | null;
};

export function ExamAccessCard({
  record,
  examName,
  examYear,
  examStartDate,
  examEndDate,
  schoolName,
  schoolLogo,
  schoolAddress,
  schoolPhone,
}: {
  record: ExamCardRecord;
  examName: string;
  examYear: string;
  examStartDate: string;
  examEndDate: string;
  schoolName: string;
  schoolLogo: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
}) {
  const isException = record.eligibility === "approved-exception";
  return (
    <div className={styles.examCard}>
      <div className={styles.cardTop}>
        <div className={styles.logoFrame}>
          {schoolLogo
            ? <Image src={schoolLogo} alt={`${schoolName} logo`} width={42} height={42} unoptimized />
            : <span>{schoolName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className={styles.schoolCopy}>
          <h2>{schoolName}</h2>
          <p>{schoolAddress || schoolPhone || "EXAMINATION ACCESS CARD"}</p>
        </div>
        <span className={styles.yearTag}>{examYear}</span>
      </div>
      <div className={styles.cardTitle}>
        <span>EXAM ACCESS CARD</span>
        <strong>{examName}</strong>
      </div>
      <div className={styles.studentBody}>
        <div className={styles.portrait}>
          {record.photoUrl
            ? <Image src={record.photoUrl} alt={`${record.name} portrait`} fill sizes="100px" unoptimized />
            : <UserRound size={36} aria-hidden="true" />}
        </div>
        <div className={styles.studentCopy}>
          <h3>{record.name}</h3>
          <p>{record.className}{record.sectionName ? ` · ${record.sectionName}` : ""}</p>
          <div className={styles.studentDetails}>
            <span>Admission no. <b>{record.admissionNumber || "—"}</b></span>
            <span>Roll no. <b>{record.rollNumber || "—"}</b></span>
          </div>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <div>
          <span>Exam dates</span>
          <b>{displayDate(examStartDate)} – {displayDate(examEndDate)}</b>
        </div>
        <strong className={isException ? styles.exceptionBadge : styles.clearedBadge}>
          {isException
            ? "APPROVED TO SIT"
            : record.invoiceCount > 0
              ? "FEES CLEARED"
              : "NO FEES DUE"}
        </strong>
      </div>
    </div>
  );
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
}
