"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, libraryBooks, libraryLoans, students } from "@/db/schema";
import { isDuplicateEntryError } from "@/lib/db-errors";
import { calculateLibraryAvailability, isFutureLibraryDueDate } from "@/lib/library-policy";
import { requireSchoolPermission } from "@/lib/access-control";

export type LibraryActionState = { error?: string; success?: boolean; message?: string };

const idField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const optionalText = z.string().trim().max(1000).transform((value) => value || null);
const nameField = z.string().trim().min(1).max(200);

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
    isbn: z.string().trim().max(20).transform((entry) => entry.replaceAll("-", "").replaceAll(" ", "") || null),
    title: nameField,
    author: z.string().trim().min(1).max(160),
    publisher: optionalText,
    category: z.string().trim().max(100).transform((entry) => entry || null),
    shelfLocation: z.string().trim().max(80).transform((entry) => entry || null),
    totalCopies: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(10000)),
    status: z.enum(["active", "archived"]),
  }).safeParse({
    bookId: value(formData, "bookId"),
    isbn: value(formData, "isbn"),
    title: value(formData, "title"),
    author: value(formData, "author"),
    publisher: value(formData, "publisher"),
    category: value(formData, "category"),
    shelfLocation: value(formData, "shelfLocation"),
    totalCopies: value(formData, "totalCopies"),
    status: value(formData, "status") || "active",
  });
  if (!parsed.success) return { error: "Enter a valid title, author, and copy count." };

  const { bookId, ...bookFields } = parsed.data;
  const publicId = randomUUID();
  try {
    const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
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
          ...bookFields,
          availableCopies,
        }).where(and(eq(libraryBooks.id, book.id), eq(libraryBooks.schoolId, context.schoolId)));
        await tx.insert(auditLogs).values({
          schoolId: context.schoolId,
          actorUserId: context.user.id,
          action: "library_book.updated",
          resourceType: "library_book",
          resourcePublicId: book.publicId,
          changedFields: ["isbn", "title", "author", "publisher", "category", "shelfLocation", "totalCopies", "status"],
        });
        return { success: true, message: "Book details updated." };
      }

      await tx.insert(libraryBooks).values({
        publicId,
        schoolId: context.schoolId,
        ...bookFields,
        availableCopies: bookFields.totalCopies,
      });
      await tx.insert(auditLogs).values({
        schoolId: context.schoolId,
        actorUserId: context.user.id,
        action: "library_book.created",
        resourceType: "library_book",
        resourcePublicId: publicId,
        changedFields: ["isbn", "title", "author", "publisher", "category", "shelfLocation", "totalCopies"],
      });
      return { success: true, message: "Book added to the catalog." };
    });
    if (outcome.success) revalidateLibrary();
    return outcome;
  } catch (error) {
    if (isDuplicateEntryError(error)) return { error: "A book with this ISBN is already in the catalog." };
    throw error;
  }
}

export async function checkoutLibraryBook(
  _state: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const context = await requireSchoolPermission("library.manage");
  const parsed = z.object({
    bookId: idField,
    studentId: idField,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({
    bookId: value(formData, "bookId"),
    studentId: value(formData, "studentId"),
    dueDate: value(formData, "dueDate"),
  });
  if (!parsed.success) {
    return { error: "Choose a book, an active student, and a valid future due date." };
  }
  if (!isFutureLibraryDueDate(parsed.data.dueDate, today())) {
    return { error: "Choose a book, an active student, and a valid future due date." };
  }

  const loanPublicId = randomUUID();
  const outcome = await db.transaction(async (tx): Promise<LibraryActionState> => {
    const [book] = await tx.select({
      id: libraryBooks.id,
      publicId: libraryBooks.publicId,
      availableCopies: libraryBooks.availableCopies,
      status: libraryBooks.status,
    }).from(libraryBooks)
      .where(and(
        eq(libraryBooks.id, parsed.data.bookId),
        eq(libraryBooks.schoolId, context.schoolId),
      )).for("update").limit(1);
    if (!book || book.status !== "active") return { error: "This book is not available for lending." };
    if (book.availableCopies < 1) return { error: "No copies are currently available." };

    const [student] = await tx.select({
      id: students.id,
      publicId: students.publicId,
    }).from(students).where(and(
      eq(students.id, parsed.data.studentId),
      eq(students.schoolId, context.schoolId),
      eq(students.status, "active"),
    )).limit(1);
    if (!student) return { error: "Choose an active student from this school." };

    await tx.update(libraryBooks).set({
      availableCopies: book.availableCopies - 1,
    }).where(and(eq(libraryBooks.id, book.id), eq(libraryBooks.schoolId, context.schoolId)));
    await tx.insert(libraryLoans).values({
      publicId: loanPublicId,
      schoolId: context.schoolId,
      bookId: book.id,
      studentId: student.id,
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
      changedFields: ["bookId", "studentId", "issuedAt", "dueDate"],
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
