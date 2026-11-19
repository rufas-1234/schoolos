import Image from "next/image";

export type StudentProfilePrintSection = {
  title: string;
  fields: Array<{ label: string; value: string | null | undefined }>;
};

export function StudentProfilePrintout({
  schoolName,
  studentName,
  admissionNumber,
  photoUrl,
  id,
  sections,
}: {
  schoolName: string;
  studentName: string;
  admissionNumber: string | null;
  photoUrl?: string | null;
  id?: string;
  sections: StudentProfilePrintSection[];
}) {
  return (
    <section id={id} className="student-profile-print-only student-admission-printout" aria-label={`${studentName} student profile printout`}>
      <header className="student-admission-printout-header">
        <div>
          <p className="student-admission-school-name">{schoolName}</p>
          <h1>STUDENT PROFILE</h1>
          <p>Please review the student information below.</p>
          <p className="student-admission-number">Admission number: {admissionNumber || "Not recorded"}</p>
        </div>
        {photoUrl ? <Image src={photoUrl} alt={`${studentName} profile photo`} width={88} height={104} unoptimized className="student-admission-photo" /> : null}
      </header>
      <h2 className="student-admission-student-name">{studentName}</h2>
      <div className="student-admission-columns">
        {sections.map((section) => (
          <section key={section.title} className="student-admission-section">
            <h2>{section.title}</h2>
            {section.fields.map((field) => (
              <div key={field.label} className="student-admission-field">
                <span>{field.label}:</span>
                <strong>{field.value?.trim() || "Not recorded"}</strong>
              </div>
            ))}
            {section.title === "Declaration" && <div className="student-admission-signature-lines"><p>Parent / Guardian signature:</p><span /><p>Date:</p><span /></div>}
          </section>
        ))}
      </div>
      <footer className="student-admission-printout-footer">Printed from the {schoolName} student portal.</footer>
    </section>
  );
}
