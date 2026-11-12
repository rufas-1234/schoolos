import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

async function insertId(rows: Promise<{ id: number }[]>) {
  const [row] = await rows;
  if (!row) throw new Error("A demo record could not be created.");
  return row.id;
}

async function seedDemoData() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Demo data seeding is disabled in production and Vercel environments.");
  }
  if (process.env.ALLOW_DEMO_DATA_SEED !== "true") {
    throw new Error("Set ALLOW_DEMO_DATA_SEED=true to explicitly enable demo data seeding.");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management";
  const databaseHost = new URL(databaseUrl).hostname;
  const isLocalDatabase = ["localhost", "127.0.0.1", "::1"].includes(databaseHost);
  if (!isLocalDatabase && process.env.ALLOW_DEMO_SEED_REMOTE !== "true") {
    throw new Error(
      "Demo data seeding only runs against a local database by default. Set ALLOW_DEMO_SEED_REMOTE=true only for an explicitly selected non-production database.",
    );
  }

  const [{ db, pool }, schema] = await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
  ]);

  try {
    const seeded = await db.transaction(async (tx) => {
      const schoolRows = await tx.select({ id: schema.schools.id }).from(schema.schools).limit(2);
      if (schoolRows.length !== 1) {
        throw new Error("Demo seeding requires exactly one configured school.");
      }
      const schoolId = schoolRows[0].id;

      const [existingSeed] = await tx
        .select({ id: schema.auditLogs.id })
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.schoolId, schoolId),
            eq(schema.auditLogs.action, "demo.seed.completed"),
            eq(schema.auditLogs.resourcePublicId, "schoolos-demo-seed-v1"),
          ),
        )
        .limit(1);
      if (existingSeed) return false;

      const [membership] = await tx
        .select({ userId: schema.schoolMemberships.userId })
        .from(schema.schoolMemberships)
        .where(
          and(
            eq(schema.schoolMemberships.schoolId, schoolId),
            eq(schema.schoolMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!membership) throw new Error("An active school administrator is required for the seed audit entry.");

      const [activeBranch] = await tx
        .select({ id: schema.schoolBranches.id })
        .from(schema.schoolBranches)
        .where(
          and(
            eq(schema.schoolBranches.schoolId, schoolId),
            eq(schema.schoolBranches.status, "active"),
          ),
        )
        .limit(1);
      const branchId =
        activeBranch?.id ??
        (await insertId(
          tx
            .insert(schema.schoolBranches)
            .values({
              publicId: randomUUID(),
              schoolId,
              name: "Demo Campus",
              code: "DEMO",
            })
            .$returningId(),
        ));

      const yearId = await insertId(
        tx
          .insert(schema.academicYears)
          .values({
            publicId: randomUUID(),
            schoolId,
            name: "2026-2027 Demo",
            startDate: "2026-08-01",
            endDate: "2027-07-31",
            status: "active",
          })
          .$returningId(),
      );
      await tx.insert(schema.academicTerms).values({
        publicId: randomUUID(),
        schoolId,
        academicYearId: yearId,
        name: "Term 1 Demo",
        startDate: "2026-08-01",
        endDate: "2026-10-30",
      });
      const termTwoId = await insertId(
        tx
          .insert(schema.academicTerms)
          .values({
            publicId: randomUUID(),
            schoolId,
            academicYearId: yearId,
            name: "Term 2 Demo",
            startDate: "2026-11-01",
            endDate: "2027-02-28",
            examStartDate: "2027-01-18",
            examEndDate: "2027-01-22",
          })
          .$returningId(),
      );
      await tx.insert(schema.academicHolidays).values({
        publicId: randomUUID(),
        schoolId,
        academicYearId: yearId,
        academicTermId: termTwoId,
        name: "December break (Demo)",
        startDate: "2026-12-20",
        endDate: "2027-01-03",
      });

      const teacherRows = [
        ["Amina", "Demo", "DEMO-T001"],
        ["Peter", "Demo", "DEMO-T002"],
        ["Grace", "Demo", "DEMO-T003"],
      ] as const;
      const teacherIds: number[] = [];
      for (const [firstName, lastName, employeeCode] of teacherRows) {
        teacherIds.push(
          await insertId(
            tx
              .insert(schema.teachers)
              .values({
                publicId: randomUUID(),
                schoolId,
                branchId,
                firstName,
                lastName,
                employeeCode,
                email: `${employeeCode.toLowerCase()}@example.invalid`,
                phone: "+1-555-0100",
                status: "active",
              })
              .$returningId(),
          ),
        );
      }

      const staffRows = [
        ["Jordan", "Demo", "DEMO-S001", "School librarian", "Library"],
        ["Taylor", "Demo", "DEMO-S002", "Office administrator", "Administration"],
      ] as const;
      for (const [firstName, lastName, employeeCode, jobTitle, department] of staffRows) {
        await tx.insert(schema.staffMembers).values({
          publicId: randomUUID(),
          schoolId,
          firstName,
          lastName,
          employeeCode,
          jobTitle,
          department,
          email: `${employeeCode.toLowerCase()}@example.invalid`,
          phone: "+1-555-0101",
          employmentType: "full_time",
          status: "active",
          startDate: "2026-08-01",
        });
      }

      const classRows = [
        ["Grade 1 Demo", "DEMO-G1"],
        ["Grade 2 Demo", "DEMO-G2"],
      ] as const;
      const classIds: number[] = [];
      for (const [name, code] of classRows) {
        classIds.push(
          await insertId(
            tx
              .insert(schema.classLevels)
              .values({ publicId: randomUUID(), schoolId, branchId, name, code })
              .$returningId(),
          ),
        );
      }

      const subjectRows = [
        ["Demo Mathematics", "DEMO-MATH", teacherIds[0]],
        ["Demo English", "DEMO-ENG", teacherIds[1]],
        ["Demo Science", "DEMO-SCI", teacherIds[2]],
      ] as const;
      const subjectIds: number[] = [];
      for (const [name, code] of subjectRows) {
        subjectIds.push(
          await insertId(
            tx
              .insert(schema.subjects)
              .values({ publicId: randomUUID(), schoolId, branchId, name, code, subjectType: "theory" })
              .$returningId(),
          ),
        );
      }

      const roomIds: number[] = [];
      for (const [roomNumber, location] of [
        ["Demo Room 101", "East wing"],
        ["Demo Room 102", "West wing"],
      ]) {
        roomIds.push(
          await insertId(
            tx
              .insert(schema.classRooms)
              .values({
                publicId: randomUUID(),
                schoolId,
                branchId,
                roomNumber,
                capacity: 30,
                location,
              })
              .$returningId(),
          ),
        );
      }

      const sectionIds: number[] = [];
      for (let index = 0; index < classIds.length; index += 1) {
        sectionIds.push(
          await insertId(
            tx
              .insert(schema.classSections)
              .values({
                publicId: randomUUID(),
                schoolId,
                academicYearId: yearId,
                classLevelId: classIds[index],
                name: "Blue (Demo)",
                capacity: 30,
                classTeacherId: teacherIds[index],
              })
              .$returningId(),
          ),
        );
      }

      const assignmentIds: number[][] = [[], []];
      for (let classIndex = 0; classIndex < classIds.length; classIndex += 1) {
        for (let subjectIndex = 0; subjectIndex < subjectIds.length; subjectIndex += 1) {
          assignmentIds[classIndex][subjectIndex] = await insertId(
            tx
              .insert(schema.classSubjects)
              .values({
                publicId: randomUUID(),
                schoolId,
                classLevelId: classIds[classIndex],
                subjectId: subjectIds[subjectIndex],
                teacherId: teacherIds[subjectIndex],
                isCompulsory: true,
              })
              .$returningId(),
          );
        }
      }

      const routineRows = [
        [0, 0, 0, 0, 1, "08:00", "08:40"],
        [0, 1, 0, 0, 1, "08:50", "09:30"],
        [1, 2, 1, 1, 1, "08:00", "08:40"],
        [1, 0, 1, 1, 2, "09:00", "09:40"],
      ] as const;
      for (const [classIndex, subjectIndex, sectionIndex, roomIndex, dayOfWeek, startsAt, endsAt] of routineRows) {
        await tx.insert(schema.classRoutines).values({
          publicId: randomUUID(),
          schoolId,
          classSectionId: sectionIds[sectionIndex],
          classSubjectId: assignmentIds[classIndex][subjectIndex],
          classRoomId: roomIds[roomIndex],
          dayOfWeek,
          startsAt,
          endsAt,
        });
      }

      const studentRows: Array<{
        firstName: string;
        lastName: string;
        status: "active" | "pending" | "admitted";
        sectionIndex: number;
        admissionNumber: string;
        admissionDate: string;
        dateOfBirth: string;
        gender: string;
        email: string;
        phone: string;
        religion: string;
        bloodGroup: string;
        currentAddress: string;
        permanentAddress: string;
        fatherName: string;
        fatherOccupation: string;
        fatherPhone: string;
        motherName: string;
        motherOccupation: string;
        motherPhone: string;
        guardianName: string;
        guardianRelation: string;
        guardianEmail: string;
        guardianPhone: string;
        guardianOccupation: string;
        guardianAddress: string;
        additionalDetails: {
          caste: string;
          heightInches: string;
          weightKg: string;
          nationalIdNumber: string;
          birthCertificateNumber: string;
          additionalNotes: string;
          bankName: string;
          bankAccountNumber: string;
          bankIfscCode: string;
          profilePhoto: { fileName: string; objectKey: string };
          documents: Array<{ title: string; fileName: string; objectKey: string }>;
          previousSchoolDetails: string;
          transportRoute: string;
          vehicleNumber: string;
          dormitoryName: string;
          dormitoryRoom: string;
          customFieldName: string;
          customFieldValue: string;
        };
      }> = [
        {
          firstName: "Noah",
          lastName: "Demo",
          status: "active",
          sectionIndex: 0,
          admissionNumber: "2026-001",
          admissionDate: "2026-08-15",
          dateOfBirth: "2018-05-12",
          gender: "male",
          email: "noah.demo.01@example.invalid",
          phone: "+1-555-0102",
          religion: "Christian",
          bloodGroup: "O+",
          currentAddress: "12 Willow Road, Demo City",
          permanentAddress: "12 Willow Road, Demo City",
          fatherName: "Daniel Demo",
          fatherOccupation: "Engineer",
          fatherPhone: "+1-555-0161",
          motherName: "Sarah Demo",
          motherOccupation: "Nurse",
          motherPhone: "+1-555-0162",
          guardianName: "Daniel Demo",
          guardianRelation: "Father",
          guardianEmail: "daniel.demo@example.invalid",
          guardianPhone: "+1-555-0161",
          guardianOccupation: "Engineer",
          guardianAddress: "12 Willow Road, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "48.0",
            weightKg: "20.4",
            nationalIdNumber: "NID-2026-001",
            birthCertificateNumber: "BC-2026-001",
            additionalNotes: "Enjoys science projects and reading short stories.",
            bankName: "Demo National Bank",
            bankAccountNumber: "1002003001",
            bankIfscCode: "DNB0001001",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Previously attended Little Stars Academy, Kindergarten section.",
            transportRoute: "North Loop 5",
            vehicleNumber: "D-101",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Mathematics",
          },
        },
        {
          firstName: "Mia",
          lastName: "Demo",
          status: "active",
          sectionIndex: 0,
          admissionNumber: "2026-002",
          admissionDate: "2026-08-18",
          dateOfBirth: "2017-11-08",
          gender: "female",
          email: "mia.demo.02@example.invalid",
          phone: "+1-555-0103",
          religion: "Islam",
          bloodGroup: "A+",
          currentAddress: "18 Cedar Avenue, Demo City",
          permanentAddress: "18 Cedar Avenue, Demo City",
          fatherName: "Ahsan Demo",
          fatherOccupation: "Business owner",
          fatherPhone: "+1-555-0163",
          motherName: "Nadia Demo",
          motherOccupation: "Teacher",
          motherPhone: "+1-555-0164",
          guardianName: "Ahsan Demo",
          guardianRelation: "Father",
          guardianEmail: "ahsan.demo@example.invalid",
          guardianPhone: "+1-555-0163",
          guardianOccupation: "Business owner",
          guardianAddress: "18 Cedar Avenue, Demo City",
          additionalDetails: {
            caste: "Muslim",
            heightInches: "50.5",
            weightKg: "22.8",
            nationalIdNumber: "NID-2026-002",
            birthCertificateNumber: "BC-2026-002",
            additionalNotes: "Loves arts and group activities.",
            bankName: "City Trust Bank",
            bankAccountNumber: "1002003002",
            bankIfscCode: "CTB0001002",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Transferred from Green Valley Academy after completing lower primary.",
            transportRoute: "South Loop 2",
            vehicleNumber: "D-202",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "English",
          },
        },
        {
          firstName: "Ethan",
          lastName: "Demo",
          status: "active",
          sectionIndex: 0,
          admissionNumber: "2026-003",
          admissionDate: "2026-08-20",
          dateOfBirth: "2018-02-14",
          gender: "male",
          email: "ethan.demo.03@example.invalid",
          phone: "+1-555-0104",
          religion: "Hindu",
          bloodGroup: "B+",
          currentAddress: "27 Rose Street, Demo City",
          permanentAddress: "27 Rose Street, Demo City",
          fatherName: "Ravi Demo",
          fatherOccupation: "Accountant",
          fatherPhone: "+1-555-0165",
          motherName: "Priya Demo",
          motherOccupation: "Designer",
          motherPhone: "+1-555-0166",
          guardianName: "Ravi Demo",
          guardianRelation: "Father",
          guardianEmail: "ravi.demo@example.invalid",
          guardianPhone: "+1-555-0165",
          guardianOccupation: "Accountant",
          guardianAddress: "27 Rose Street, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "49.2",
            weightKg: "21.5",
            nationalIdNumber: "NID-2026-003",
            birthCertificateNumber: "BC-2026-003",
            additionalNotes: "Shows strong interest in building and robotics activities.",
            bankName: "Prime Financial",
            bankAccountNumber: "1002003003",
            bankIfscCode: "PFR0001003",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Completed preschool at Bright Horizon Learning Center.",
            transportRoute: "Central Square 3",
            vehicleNumber: "D-303",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Science",
          },
        },
        {
          firstName: "Sophia",
          lastName: "Demo",
          status: "active",
          sectionIndex: 1,
          admissionNumber: "2026-004",
          admissionDate: "2026-08-22",
          dateOfBirth: "2017-09-02",
          gender: "female",
          email: "sophia.demo.04@example.invalid",
          phone: "+1-555-0105",
          religion: "Christian",
          bloodGroup: "AB+",
          currentAddress: "41 Pine Lane, Demo City",
          permanentAddress: "41 Pine Lane, Demo City",
          fatherName: "Marcus Demo",
          fatherOccupation: "Physician",
          fatherPhone: "+1-555-0167",
          motherName: "Clara Demo",
          motherOccupation: "Pharmacist",
          motherPhone: "+1-555-0168",
          guardianName: "Marcus Demo",
          guardianRelation: "Father",
          guardianEmail: "marcus.demo@example.invalid",
          guardianPhone: "+1-555-0167",
          guardianOccupation: "Physician",
          guardianAddress: "41 Pine Lane, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "51.0",
            weightKg: "23.5",
            nationalIdNumber: "NID-2026-004",
            birthCertificateNumber: "BC-2026-004",
            additionalNotes: "Active in choir and reading competitions.",
            bankName: "Horizon Savings Bank",
            bankAccountNumber: "1002003004",
            bankIfscCode: "HSB0001004",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Previously attended St. Anne's Academy for junior classes.",
            transportRoute: "West Ridge 7",
            vehicleNumber: "D-404",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Literature",
          },
        },
        {
          firstName: "Liam",
          lastName: "Demo",
          status: "active",
          sectionIndex: 1,
          admissionNumber: "2026-005",
          admissionDate: "2026-08-25",
          dateOfBirth: "2018-04-21",
          gender: "male",
          email: "liam.demo.05@example.invalid",
          phone: "+1-555-0106",
          religion: "Catholic",
          bloodGroup: "O-",
          currentAddress: "15 Maple Court, Demo City",
          permanentAddress: "15 Maple Court, Demo City",
          fatherName: "Thomas Demo",
          fatherOccupation: "Courier driver",
          fatherPhone: "+1-555-0169",
          motherName: "Emma Demo",
          motherOccupation: "Homemaker",
          motherPhone: "+1-555-0170",
          guardianName: "Thomas Demo",
          guardianRelation: "Father",
          guardianEmail: "thomas.demo@example.invalid",
          guardianPhone: "+1-555-0169",
          guardianOccupation: "Courier driver",
          guardianAddress: "15 Maple Court, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "49.8",
            weightKg: "21.9",
            nationalIdNumber: "NID-2026-005",
            birthCertificateNumber: "BC-2026-005",
            additionalNotes: "Enjoys football and outdoor games after school.",
            bankName: "Metro City Bank",
            bankAccountNumber: "1002003005",
            bankIfscCode: "MCB0001005",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Transferred from Kingsway Preparatory School.",
            transportRoute: "Sports Avenue 1",
            vehicleNumber: "D-505",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Physical Education",
          },
        },
        {
          firstName: "Olivia",
          lastName: "Demo",
          status: "active",
          sectionIndex: 1,
          admissionNumber: "2026-006",
          admissionDate: "2026-08-30",
          dateOfBirth: "2018-06-09",
          gender: "female",
          email: "olivia.demo.06@example.invalid",
          phone: "+1-555-0107",
          religion: "Islam",
          bloodGroup: "A-",
          currentAddress: "90 Lakeview Drive, Demo City",
          permanentAddress: "90 Lakeview Drive, Demo City",
          fatherName: "Imran Demo",
          fatherOccupation: "IT specialist",
          fatherPhone: "+1-555-0171",
          motherName: "Farah Demo",
          motherOccupation: "Office manager",
          motherPhone: "+1-555-0172",
          guardianName: "Imran Demo",
          guardianRelation: "Father",
          guardianEmail: "imran.demo@example.invalid",
          guardianPhone: "+1-555-0171",
          guardianOccupation: "IT specialist",
          guardianAddress: "90 Lakeview Drive, Demo City",
          additionalDetails: {
            caste: "Muslim",
            heightInches: "50.9",
            weightKg: "22.1",
            nationalIdNumber: "NID-2026-006",
            birthCertificateNumber: "BC-2026-006",
            additionalNotes: "Excels in classroom discussion and teamwork.",
            bankName: "East Harbor Bank",
            bankAccountNumber: "1002003006",
            bankIfscCode: "EHB0001006",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Completed early years at Sunshine Academy.",
            transportRoute: "Lakeview Route 9",
            vehicleNumber: "D-606",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Art",
          },
        },
        {
          firstName: "Ava",
          lastName: "Demo",
          status: "pending",
          sectionIndex: 0,
          admissionNumber: "2026-007",
          admissionDate: "2026-09-02",
          dateOfBirth: "2017-12-19",
          gender: "female",
          email: "ava.demo.07@example.invalid",
          phone: "+1-555-0108",
          religion: "Hindu",
          bloodGroup: "B-",
          currentAddress: "7 Orchard Close, Demo City",
          permanentAddress: "7 Orchard Close, Demo City",
          fatherName: "Sanjay Demo",
          fatherOccupation: "Farmer",
          fatherPhone: "+1-555-0173",
          motherName: "Meera Demo",
          motherOccupation: "School aide",
          motherPhone: "+1-555-0174",
          guardianName: "Sanjay Demo",
          guardianRelation: "Father",
          guardianEmail: "sanjay.demo@example.invalid",
          guardianPhone: "+1-555-0173",
          guardianOccupation: "Farmer",
          guardianAddress: "7 Orchard Close, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "49.6",
            weightKg: "21.2",
            nationalIdNumber: "NID-2026-007",
            birthCertificateNumber: "BC-2026-007",
            additionalNotes: "Awaiting final admission approval and transport allocation.",
            bankName: "Blue River Bank",
            bankAccountNumber: "1002003007",
            bankIfscCode: "BRB0001007",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Application received from Meadow Hill Kindergarten.",
            transportRoute: "Rural Route 4",
            vehicleNumber: "D-707",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "Music",
          },
        },
        {
          firstName: "Lucas",
          lastName: "Demo",
          status: "admitted",
          sectionIndex: 1,
          admissionNumber: "2026-008",
          admissionDate: "2026-09-05",
          dateOfBirth: "2017-08-16",
          gender: "male",
          email: "lucas.demo.08@example.invalid",
          phone: "+1-555-0109",
          religion: "Christian",
          bloodGroup: "A+",
          currentAddress: "65 Sunset Lane, Demo City",
          permanentAddress: "65 Sunset Lane, Demo City",
          fatherName: "Nathan Demo",
          fatherOccupation: "Construction supervisor",
          fatherPhone: "+1-555-0175",
          motherName: "Lily Demo",
          motherOccupation: "Receptionist",
          motherPhone: "+1-555-0176",
          guardianName: "Nathan Demo",
          guardianRelation: "Father",
          guardianEmail: "nathan.demo@example.invalid",
          guardianPhone: "+1-555-0175",
          guardianOccupation: "Construction supervisor",
          guardianAddress: "65 Sunset Lane, Demo City",
          additionalDetails: {
            caste: "General",
            heightInches: "52.1",
            weightKg: "24.7",
            nationalIdNumber: "NID-2026-008",
            birthCertificateNumber: "BC-2026-008",
            additionalNotes: "Prefers structured activities and hands-on tasks.",
            bankName: "Summit Credit Union",
            bankAccountNumber: "1002003008",
            bankIfscCode: "SCU0001008",
            profilePhoto: { fileName: "", objectKey: "" },
            documents: [
              { title: "Birth Certificate", fileName: "", objectKey: "" },
              { title: "Transfer Certificate", fileName: "", objectKey: "" },
              { title: "Previous Marksheet", fileName: "", objectKey: "" },
              { title: "Vaccination Record", fileName: "", objectKey: "" },
            ],
            previousSchoolDetails: "Previously studied at Summerfield Academy for kindergarten.",
            transportRoute: "Sunset Route 6",
            vehicleNumber: "D-808",
            dormitoryName: "",
            dormitoryRoom: "",
            customFieldName: "Favorite subject",
            customFieldValue: "STEM",
          },
        },
      ];
      for (let index = 0; index < studentRows.length; index += 1) {
        const student = studentRows[index];
        const { sectionIndex, status, admissionNumber, admissionDate, dateOfBirth, gender, email, phone, religion, bloodGroup, currentAddress, permanentAddress, fatherName, fatherOccupation, fatherPhone, motherName, motherOccupation, motherPhone, guardianName, guardianRelation, guardianEmail, guardianPhone, guardianOccupation, guardianAddress, additionalDetails } = student;
        const studentId = await insertId(
          tx
            .insert(schema.students)
            .values({
              publicId: randomUUID(),
              schoolId,
              branchId,
              firstName: student.firstName,
              lastName: student.lastName,
              gender,
              dateOfBirth,
              email,
              phone,
              religion,
              bloodGroup,
              currentAddress,
              permanentAddress,
              fatherName,
              fatherOccupation,
              fatherPhone,
              motherName,
              motherOccupation,
              motherPhone,
              guardianName,
              guardianRelation,
              guardianEmail,
              guardianPhone,
              guardianOccupation,
              guardianAddress,
              additionalDetails,
              admissionNumber,
              admissionDate,
              status,
            })
            .$returningId(),
        );
        if (status === "active" || status === "admitted") {
          await tx.insert(schema.studentEnrollments).values({
            publicId: randomUUID(),
            schoolId,
            studentId,
            academicYearId: yearId,
            classSectionId: sectionIds[sectionIndex],
            status: "enrolled",
            enrolledAt: admissionDate,
          });
        }
      }

      await tx.insert(schema.auditLogs).values({
        schoolId,
        actorUserId: membership.userId,
        action: "demo.seed.completed",
        resourceType: "demo_data",
        resourcePublicId: "schoolos-demo-seed-v1",
        changedFields: [
          "academic_years",
          "classes_and_sections",
          "subjects_and_routines",
          "teachers_and_staff",
          "students_and_enrollments",
        ],
      });
      return true;
    });

    console.log(
      seeded
        ? "Demo academic, student, and staff data seeded successfully."
        : "Demo data was already seeded; no records were changed.",
    );
  } finally {
    await pool.end();
  }
}

seedDemoData().catch((error: unknown) => {
  console.error("Demo data seeding failed:", error);
  process.exitCode = 1;
});
