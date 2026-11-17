"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  libraryBooks,
  libraryCategories,
  libraryLoans,
  libraryMembers,
  librarySubjects,
  schoolBranches,
  staffMembers,
  students,
} from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { calculateLibraryAvailability, isFutureLibraryDueDate } from "@/lib/library-policy";
import { requireSchoolPermission } from "@/lib/access-control";

export type LibraryActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const optionalText = z.string().trim().max(1000).transform((value) => value || null);
const nameField = z.string().trim().min(1).max(200);
const optionalId = z.union([z.literal(""), idField]).transform((entry) => entry || null);

function value(formData: FormData, key: string): string {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateLibrary() {
  revalidatePath("/admin/library");
  revalidatePath("/admin");
}

export async function saveLibraryBook(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    bookId: z.union([z.literal(""), idField]),
    branchId: optionalId,
    categoryId: optionalId,
    subjectId: optionalId,
    bookNumber: z.string().trim().max(40).transform((entry) => entry || null),
    isbn: z.string().trim().max(20).transform((entry) => entry.replaceAll("-", "").replaceAll(" ", "") || null),
    title: nameField,
    author: z.string().trim().min(1).max(160),
    publisher: optionalText,
    category: z.string().trim().max(100).transform((entry) => entry || null),
    description: optionalText,
    shelfLocation: z.string().trim().max(80).transform((entry) => entry || null),
    price: z.string().trim().regex(/^(?:\d{1,10}(?:\.\d{1,2})?)?$/).transform((entry) => entry || null),
    totalCopies: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(10000)),
    status: z.enum(["active", "archived"]),
  }).safeParse({
    bookId: value(formData, "bookId"),
    branchId: value(formData, "branchId"),
    categoryId: value(formData, "categoryId"),
    subjectId: value(formData, "subjectId"),
    bookNumber: value(formData, "bookNumber"),
    isbn: value(formData, "isbn"),
    title: value(formData, "title"),
    author: value(formData, "author"),
    publisher: value(formData, "publisher"),
    category: value(formData, "category"),
    description: value(formData, "description"),
    shelfLocation: value(formData, "shelfLocation"),
    price: value(formData, "price"),
    totalCopies: value(formData, "totalCopies"),
    status: value(formData, "status") || "active",
  });
  if (!parsed.success) return { error: "Enter a valid title, author, and copy count." };

  const { bookId, ...bookFields } = parsed.data;
  const { categoryId, subjectId, branchId, ...bookValues } = bookFields;
  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
      if (branchId) {
        const [branch] = await tx.select({ id: schoolBranches.id }).from(schoolBranches)
          .where(and(eq(schoolBranches.id, branchId), eq(schoolBranches.schoolId, context.schoolId)))
          .limit(1);
        if (!branch) return { error: "Choose a branch belonging to this school." };
      }
      const [category] = categoryId
        ? await tx.select({ id: libraryCategories.id, name: libraryCategories.name, branchId: libraryCategories.branchId }).from(libraryCategories)
          .where(and(
            eq(libraryCategories.id, categoryId),
            eq(libraryCategories.schoolId, context.schoolId),
            eq(libraryCategories.status, "active"),
          )).limit(1)
        : [];
      const [subject] = subjectId
        ? await tx.select({ id: librarySubjects.id, branchId: librarySubjects.branchId }).from(librarySubjects)
          .where(and(
            eq(librarySubjects.id, subjectId),
            eq(librarySubjects.schoolId, context.schoolId),
            eq(librarySubjects.status, "active"),
          )).limit(1)
        : [];
      if (categoryId && !category || subjectId && !subject) {
        return { error: "Choose an active category and subject from this school." };
      }
      if (
        category && category.branchId !== null && category.branchId !== branchId ||
        subject && subject.branchId !== null && subject.branchId !== branchId
      ) {
        return { error: "Choose categories and subjects assigned to the selected branch." };
      }
      const values = {
        ...bookValues,
        branchId,
        categoryId,
        subjectId,
        category: category?.name ?? bookValues.category,
      };
      if (bookId) {
        const [book] = await tx.select({
          id: libraryBooks.id,
          publicId: libraryBooks.publicId,
          totalCopies: libraryBooks.totalCopies,
          availableCopies: libraryBooks.availableCopies,
        }).from(libraryBooks)
          .where(and(eq(libraryBooks.id, bookId), eq(libraryBooks.schoolId, context.schoolId)))
          .for("update").limit(1);
        if (!book) return { error: "The selected book was not found." };
        const activeLoanRows = await tx.select({ value: count() }).from(libraryLoans)
          .where(and(
            eq(libraryLoans.schoolId, context.schoolId),
            eq(libraryLoans.bookId, book.id),
            eq(libraryLoans.status, "active"),
          ));
        const onLoan = book.totalCopies - book.availableCopies;
        const availableCopies = calculateLibraryAvailability(
          book.totalCopies,
          book.availableCopies,
          bookFields.totalCopies,
        );
        if (availableCopies === null) {
          return { error: `At least ${onLoan} copies are currently on loan; increase the total or wait for returns.` };
        }
        if (bookFields.status === "archived" && Number(activeLoanRows[0]?.value ?? 0) > 0) {
          return { error: "Return all borrowed copies before archiving this book." };
        }
        await tx.update(libraryBooks).set({
          ...values,
          availableCopies,
        }).where(and(eq(libraryBooks.id, book.id), eq(libraryBooks.schoolId, context.schoolId)));
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "library_book.updated",
          resourceType: "library_book",
          resourcePublicId: book.publicId,
          changedFields: ["branchId", "categoryId", "subjectId", "bookNumber", "isbn", "title", "author", "publisher", "category", "description", "shelfLocation", "price", "totalCopies", "status"],
        });
        return { success: true, message: "Book details updated." };
      }

      await tx.insert(libraryBooks).values({
        publicId,
        schoolId: context.schoolId,
        ...values,
        availableCopies: bookValues.totalCopies,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "library_book.created",
        resourceType: "library_book",
        resourcePublicId: publicId,
        changedFields: ["branchId", "categoryId", "subjectId", "bookNumber", "isbn", "title", "author", "publisher", "category", "description", "shelfLocation", "price", "totalCopies"],
      });
      return { success: true, message: "Book added to the catalog." };
    });
    if (outcome.success) revalidateLibrary();
    return outcome;
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A book with this book number or ISBN is already in the catalog." };
    throw error;
  }
}

export async function saveLibraryTerm(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    type: z.enum(["category", "subject"]),
    name: z.string().trim().min(1).max(120),
    branchId: optionalId,
  }).safeParse({
    type: value(formData, "type"),
    name: value(formData, "name"),
    branchId: value(formData, "branchId"),
  });
  if (!parsed.success) return { error: "Enter a valid name and branch." };
  if (parsed.data.branchId) {
    const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches)
      .where(and(eq(schoolBranches.id, parsed.data.branchId), eq(schoolBranches.schoolId, context.schoolId)))
      .limit(1);
    if (!branch) return { error: "Choose a branch belonging to this school." };
  }
  const table = parsed.data.type === "category" ? libraryCategories : librarySubjects;
  const termId = idField.safeParse(value(formData, "termId"));
  const status = z.enum(["active", "archived"]).safeParse(value(formData, "status") || "active");
  if (value(formData, "termId") && !termId.success || !status.success) {
    return { error: "Enter a valid name, branch, and status." };
  }
  if (termId.success) {
    const [existing] = await db.select({ id: table.id, publicId: table.publicId }).from(table)
      .where(and(eq(table.id, termId.data), eq(table.schoolId, context.schoolId))).limit(1);
    if (!existing) return { error: "The selected record was not found." };
    try {
      await db.update(table).set({
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        status: status.data,
      }).where(and(eq(table.id, existing.id), eq(table.schoolId, context.schoolId)));
    } catch (error) {
      if (isDuplicateEntryError(error)) return { error: "A record with that name already exists." };
      throw error;
    }
    await db.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `library_${parsed.data.type}.updated`,
      resourceType: `library_${parsed.data.type}`,
      resourcePublicId: existing.publicId,
      changedFields: ["branchId", "name", "status"],
    });
    revalidateLibrary();
    return { success: true, message: `${parsed.data.type === "category" ? "Category" : "Subject"} updated.` };
  }
  const publicId = randomUUID();
  try {
    await db.insert(table).values({
      publicId,
      schoolId: context.schoolId,
      branchId: parsed.data.branchId,
      name: parsed.data.name,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A record with that name already exists." };
    throw error;
  }
  await db.insert(auditLogs).values({
    schoolId: context.schoolId,
    actorUserId: context.user.id,
    action: `library_${parsed.data.type}.created`,
    resourceType: `library_${parsed.data.type}`,
    resourcePublicId: publicId,
    changedFields: ["branchId", "name"],
  });
  revalidateLibrary();
  return { success: true, message: `${parsed.data.type === "category" ? "Category" : "Subject"} added.` };
}

export async function saveLibraryMember(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    memberType: z.enum(["student", "staff"]),
    personId: idField,
    memberNumber: z.string().trim().min(1).max(40),
    branchId: optionalId,
  }).safeParse({
    memberType: value(formData, "memberType"),
    personId: value(formData, "personId"),
    memberNumber: value(formData, "memberNumber"),
    branchId: value(formData, "branchId"),
  });
  if (!parsed.success) return { error: "Choose an active student or staff member and enter a member number." };
  const [person] = parsed.data.memberType === "student"
    ? await db.select({
      id: students.id,
      branchId: students.branchId,
    }).from(students).where(and(
      eq(students.id, parsed.data.personId),
      eq(students.schoolId, context.schoolId),
      inArray(students.status, ["active", "admitted"]),
    )).limit(1)
    : await db.select({
      id: staffMembers.id,
      branchId: staffMembers.branchId,
    }).from(staffMembers).where(and(
      eq(staffMembers.id, parsed.data.personId),
      eq(staffMembers.schoolId, context.schoolId),
      eq(staffMembers.status, "active"),
    )).limit(1);
  if (!person) return { error: `Choose an active ${parsed.data.memberType} from this school.` };
  const branchId = parsed.data.branchId ?? person.branchId;
  if (parsed.data.branchId) {
    const [branch] = await db.select({ id: schoolBranches.id }).from(schoolBranches).where(and(
      eq(schoolBranches.id, parsed.data.branchId),
      eq(schoolBranches.schoolId, context.schoolId),
      eq(schoolBranches.status, "active"),
    )).limit(1);
    if (!branch) return { error: "Choose an active branch belonging to this school." };
  }
  if (parsed.data.branchId && person.branchId && parsed.data.branchId !== person.branchId) {
    return { error: `Choose the ${parsed.data.memberType}'s assigned branch.` };
  }
  const publicId = randomUUID();
  try {
    await db.insert(libraryMembers).values({
      publicId,
      schoolId: context.schoolId,
      branchId,
      memberType: parsed.data.memberType,
      studentId: parsed.data.memberType === "student" ? person.id : null,
      staffMemberId: parsed.data.memberType === "staff" ? person.id : null,
      memberNumber: parsed.data.memberNumber,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "This person is already a library member or that member number is in use." };
    throw error;
  }
  await db.insert(auditLogs).values({
    schoolId: context.schoolId,
    actorUserId: context.user.id,
    action: "library_member.created",
    resourceType: "library_member",
    resourcePublicId: publicId,
    changedFields: ["branchId", "memberType", "studentId", "staffMemberId", "memberNumber"],
  });
  revalidateLibrary();
  return { success: true, message: "Library member added." };
}

export async function setLibraryMemberStatus(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const memberId = idField.safeParse(value(formData, "memberId"));
  const status = z.enum(["active", "inactive"]).safeParse(value(formData, "status"));
  if (!memberId.success || !status.success) return { error: "Select a valid member status." };
  const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
    const [member] = await tx.select({
      id: libraryMembers.id,
      publicId: libraryMembers.publicId,
      studentId: libraryMembers.studentId,
      staffMemberId: libraryMembers.staffMemberId,
    }).from(libraryMembers).where(and(
      eq(libraryMembers.id, memberId.data),
      eq(libraryMembers.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!member) return { error: "Library member was not found." };
    if (status.data === "inactive") {
      const [activeLoan] = await tx.select({ id: libraryLoans.id }).from(libraryLoans)
        .where(and(
          eq(libraryLoans.schoolId, context.schoolId),
          or(
            eq(libraryLoans.memberId, member.id),
            member.studentId !== null ? eq(libraryLoans.studentId, member.studentId) : undefined,
          ),
          eq(libraryLoans.status, "active"),
        )).limit(1);
      if (activeLoan) return { error: "Return this member's active books before deactivating the membership." };
    }
    await tx.update(libraryMembers).set({ status: status.data })
      .where(and(eq(libraryMembers.id, member.id), eq(libraryMembers.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: `library_member.${status.data}`,
      resourceType: "library_member",
      resourcePublicId: member.publicId,
      changedFields: ["status"],
    });
    return { success: true, message: `Library membership ${status.data}.` };
  });
  if (!outcome.success) return outcome;
  revalidateLibrary();
  return outcome;
}

export async function checkoutLibraryBook(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    bookId: idField,
    memberId: idField,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({
    bookId: value(formData, "bookId"),
    memberId: value(formData, "memberId"),
    dueDate: value(formData, "dueDate"),
  });
  if (!parsed.success) {
    return { error: "Choose a book, an active library member, and a valid future due date." };
  }
  if (!isFutureLibraryDueDate(parsed.data.dueDate, today())) {
    return { error: "Choose a book, an active library member, and a valid future due date." };
  }

  const loanPublicId = randomUUID();
  const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
    const [book] = await tx.select({
      id: libraryBooks.id,
      publicId: libraryBooks.publicId,
      availableCopies: libraryBooks.availableCopies,
      status: libraryBooks.status,
      branchId: libraryBooks.branchId,
    }).from(libraryBooks)
      .where(and(
        eq(libraryBooks.id, parsed.data.bookId),
        eq(libraryBooks.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!book || book.status !== "active") return { error: "This book is not available for lending." };
    if (book.availableCopies < 1) return { error: "No copies are currently available." };

    const [member] = await tx.select({
      id: libraryMembers.id,
      memberType: libraryMembers.memberType,
      studentId: libraryMembers.studentId,
      staffMemberId: libraryMembers.staffMemberId,
      branchId: libraryMembers.branchId,
    }).from(libraryMembers).where(and(
      eq(libraryMembers.id, parsed.data.memberId),
      eq(libraryMembers.schoolId, context.schoolId),
      eq(libraryMembers.status, "active"),
    )).for("update").limit(1);
    if (!member) return { error: "Choose an active library member from this school." };
    if (book.branchId !== null && book.branchId !== member.branchId) {
      return { error: "This book is assigned to a different branch." };
    }
    if (member.memberType === "student") {
      if (member.studentId === null) throw new Error("A student library member is missing its student record.");
      const [student] = await tx.select({ id: students.id }).from(students).where(and(
        eq(students.id, member.studentId),
        eq(students.schoolId, context.schoolId),
        inArray(students.status, ["active", "admitted"]),
      )).limit(1);
      if (!student) return { error: "The linked student is not currently active." };
    } else {
      if (member.staffMemberId === null) throw new Error("A staff library member is missing its staff record.");
      const [staff] = await tx.select({ id: staffMembers.id }).from(staffMembers).where(and(
        eq(staffMembers.id, member.staffMemberId),
        eq(staffMembers.schoolId, context.schoolId),
        eq(staffMembers.status, "active"),
      )).limit(1);
      if (!staff) return { error: "The linked staff member is not currently active." };
    }

    await tx.update(libraryBooks).set({
      availableCopies: book.availableCopies - 1,
    }).where(and(eq(libraryBooks.id, book.id), eq(libraryBooks.schoolId, context.schoolId)));
    await tx.insert(libraryLoans).values({
      publicId: loanPublicId,
      schoolId: context.schoolId,
      bookId: book.id,
      studentId: member.studentId,
      memberId: member.id,
      issuedAt: today(),
      dueDate: parsed.data.dueDate,
      issuedBy: context.user.id,
    });
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "library_loan.issued",
      resourceType: "library_loan",
      resourcePublicId: loanPublicId,
      changedFields: ["bookId", "memberId", "issuedAt", "dueDate"],
    });
    return { success: true, message: "Book checked out successfully." };
  });
  if (outcome.success) revalidateLibrary();
  return outcome;
}

export async function returnLibraryBook(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = idField.safeParse(value(formData, "loanId"));
  if (!parsed.success) return { error: "Select a valid loan to return." };

  const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
    const [loan] = await tx.select({
      id: libraryLoans.id,
      publicId: libraryLoans.publicId,
      bookId: libraryLoans.bookId,
    }).from(libraryLoans).where(and(
      eq(libraryLoans.id, parsed.data),
      eq(libraryLoans.schoolId, context.schoolId),
      eq(libraryLoans.status, "active"),
    )).for("update").limit(1);
    if (!loan) return { error: "This loan was already returned or could not be found." };

    const [book] = await tx.select({
      id: libraryBooks.id,
      publicId: libraryBooks.publicId,
      totalCopies: libraryBooks.totalCopies,
      availableCopies: libraryBooks.availableCopies,
    }).from(libraryBooks).where(and(
      eq(libraryBooks.id, loan.bookId),
      eq(libraryBooks.schoolId, context.schoolId),
    )).for("update").limit(1);
    if (!book) throw new Error("The loan's book record is missing.");

    await tx.update(libraryLoans).set({
      status: "returned",
      returnedAt: today(),
      returnedBy: context.user.id,
    }).where(and(
      eq(libraryLoans.id, loan.id),
      eq(libraryLoans.schoolId, context.schoolId),
      eq(libraryLoans.status, "active"),
    ));
    await tx.update(libraryBooks).set({
      availableCopies: Math.min(book.totalCopies, book.availableCopies + 1),
    }).where(and(eq(libraryBooks.id, book.id), eq(libraryBooks.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "library_loan.returned",
      resourceType: "library_loan",
      resourcePublicId: loan.publicId,
      changedFields: ["status", "returnedAt", "returnedBy"],
    });
    return { success: true, message: "Book returned successfully." };
  });
  if (outcome.success) revalidateLibrary();
  return outcome;
}

export async function renewLibraryLoan(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    loanId: idField,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({
    loanId: value(formData, "loanId"),
    dueDate: value(formData, "dueDate"),
  });
  if (!parsed.success) return { error: "Choose a valid future renewal date." };
  if (!isFutureLibraryDueDate(parsed.data.dueDate, today())) {
    return { error: "Choose a valid future renewal date." };
  }

  const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
    const [loan] = await tx.select({
      id: libraryLoans.id,
      publicId: libraryLoans.publicId,
      dueDate: libraryLoans.dueDate,
    }).from(libraryLoans).where(and(
      eq(libraryLoans.id, parsed.data.loanId),
      eq(libraryLoans.schoolId, context.schoolId),
      eq(libraryLoans.status, "active"),
    )).for("update").limit(1);
    if (!loan) return { error: "This loan is no longer active." };
    if (parsed.data.dueDate <= loan.dueDate) {
      return { error: "A renewal date must be later than the current due date." };
    }

    await tx.update(libraryLoans).set({ dueDate: parsed.data.dueDate })
      .where(and(eq(libraryLoans.id, loan.id), eq(libraryLoans.schoolId, context.schoolId)));
    await tx.insert(auditLogs).values({
      schoolId: context.schoolId,
      actorUserId: context.user.id,
      action: "library_loan.renewed",
      resourceType: "library_loan",
      resourcePublicId: loan.publicId,
      changedFields: ["dueDate"],
    });
    return { success: true, message: "Loan due date extended." };
  });
  if (outcome.success) revalidateLibrary();
  return outcome;
}
