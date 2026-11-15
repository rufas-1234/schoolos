export type StaffSettingField = {
  name: string;
  label: string;
  group: string;
  locked?: boolean;
};

export const staffSettingFields: readonly StaffSettingField[] = [
  { name: "branchId", label: "Branch", group: "Basic information", locked: true },
  { name: "firstName", label: "First name", group: "Basic information", locked: true },
  { name: "lastName", label: "Last name", group: "Basic information", locked: true },
  { name: "employeeCode", label: "Staff number", group: "Basic information" },
  { name: "personnelRole", label: "Staff role", group: "Basic information" },
  { name: "jobTitle", label: "Designation", group: "Basic information", locked: true },
  { name: "department", label: "Department", group: "Basic information", locked: true },
  { name: "email", label: "Email", group: "Basic information" },
  { name: "phone", label: "Mobile number", group: "Basic information" },
  { name: "dateOfBirth", label: "Date of birth", group: "Basic information" },
  { name: "startDate", label: "Joining date", group: "Basic information" },
  { name: "gender", label: "Gender", group: "Basic information" },
  { name: "maritalStatus", label: "Marital status", group: "Basic information" },
  { name: "fatherName", label: "Father's name", group: "Basic information" },
  { name: "motherName", label: "Mother's name", group: "Basic information" },
  { name: "emergencyContactName", label: "Emergency contact name", group: "Basic information" },
  { name: "emergencyContactPhone", label: "Emergency mobile", group: "Basic information" },
  { name: "drivingLicense", label: "Driving license", group: "Basic information" },
  { name: "showAsExpert", label: "Expert staff flag", group: "Basic information" },
  { name: "address", label: "Current address", group: "Basic information" },
  { name: "permanentAddress", label: "Permanent address", group: "Basic information" },
  { name: "qualification", label: "Qualifications", group: "Basic information" },
  { name: "experience", label: "Experience", group: "Basic information" },
  { name: "employmentType", label: "Employment type", group: "Basic information", locked: true },
  { name: "epfNumber", label: "EPF number", group: "Payroll details" },
  { name: "basicSalary", label: "Basic salary", group: "Payroll details" },
  { name: "contractType", label: "Contract type", group: "Payroll details" },
  { name: "location", label: "Location", group: "Payroll details" },
  { name: "bankAccountName", label: "Account name", group: "Bank details" },
  { name: "bankAccountNumber", label: "Account number", group: "Bank details" },
  { name: "bankName", label: "Bank name", group: "Bank details" },
  { name: "bankBranch", label: "Bank branch", group: "Bank details" },
  { name: "facebookUrl", label: "Facebook URL", group: "Social links" },
  { name: "twitterUrl", label: "Twitter URL", group: "Social links" },
  { name: "linkedinUrl", label: "LinkedIn URL", group: "Social links" },
  { name: "instagramUrl", label: "Instagram URL", group: "Social links" },
  { name: "profilePhotoFileName", label: "Profile photo", group: "Documents" },
  { name: "resumeFileName", label: "Resume", group: "Documents" },
  { name: "joiningLetterFileName", label: "Joining letter", group: "Documents" },
  { name: "otherDocumentFileName", label: "Other document", group: "Documents" },
  { name: "linkedUserId", label: "Linked school account", group: "Documents" },
  { name: "customFieldName1", label: "Custom field 1 name", group: "Custom fields" },
  { name: "customFieldValue1", label: "Custom field 1 value", group: "Custom fields" },
  { name: "customFieldName2", label: "Custom field 2 name", group: "Custom fields" },
  { name: "customFieldValue2", label: "Custom field 2 value", group: "Custom fields" },
];

export const defaultRequiredStaffFields = staffSettingFields
  .filter((field) => field.locked)
  .map((field) => field.name);

export function normalizeRequiredStaffFields(fields: string[] | null | undefined): string[] {
  return [...new Set([
    ...defaultRequiredStaffFields,
    ...(fields ?? []).filter((name) => staffSettingFields.some((field) => field.name === name)),
  ])];
}

export function getStaffRequiredFieldError(
  values: Record<string, string | number | undefined>,
  requiredFields: string[],
): string | null {
  for (const field of staffSettingFields) {
    if (!requiredFields.includes(field.name)) continue;
    if (!String(values[field.name] ?? "").trim()) return `${field.label} is required.`;
  }
  return null;
}
