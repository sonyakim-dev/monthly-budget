import { z } from "zod";
import { AMOUNT_ERROR, NAME_MAX, NAME_TOO_LONG } from "./entry-input";
import { formatDate, isValidIsoDate } from "./dates";
import { parseAmountInput } from "./money";

/** groupId is NEW_GROUP when the bill goes into a new group called newGroup. */
export type BillInput = {
  amountCents: number;
  name: string;
  groupId: string;
  newGroup: string | null;
  dueDay: number | null;
};

export type BillErrors = Partial<Record<"amount" | "name" | "groupId" | "newGroup" | "dueDay", string>>;

export type SavingsInput = { amountCents: number; name: string; day: number | null };
export type SavingsErrors = Partial<Record<"amount" | "name" | "day", string>>;

export const INCOME_FREQUENCIES = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number]["value"];
export type IncomeInput = { amountCents: number; name: string; frequency: IncomeFrequency; endDate: string | null; categoryId: string };
export type IncomeErrors = Partial<Record<"amount" | "name" | "frequency" | "endDate" | "categoryId", string>>;

/** Which payments of other income a change applies to: just the one the sheet was opened from, all of them, or that one and later. */
export type IncomeScope = "one" | "all" | "later";
export function parseIncomeScope(value: FormDataEntryValue | null): IncomeScope | null {
  return value === "one" || value === "all" || value === "later" ? value : null;
}

export const NEW_GROUP = "new";

export type GroupInput = { name: string; color: string };
export type GroupErrors = Partial<Record<"name" | "color", string>>;

/** Colors offered for bill groups, in the same soft tones as the default groups. */
export const GROUP_COLORS = [
  { hex: "#f5d76e", name: "Yellow" },
  { hex: "#f2b880", name: "Orange" },
  { hex: "#f0a8a0", name: "Red" },
  { hex: "#b9a8e0", name: "Purple" },
  { hex: "#8fb8e8", name: "Blue" },
  { hex: "#8fd0d0", name: "Teal" },
  { hex: "#9ccc9c", name: "Green" },
  { hex: "#c8c8c0", name: "Gray" },
] as const;

/** Which months an amount change applies to: just the month being viewed, or that month and later. */
export type ApplyScope = "month" | "later";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const nameError = (name: string, empty: string) => (!name ? empty : name.length > NAME_MAX ? NAME_TOO_LONG : undefined);

const DAY_ERROR = "Enter a day from 1 to 31.";
/** An optional day of the month: null when blank, undefined when it isn't 1 to 31. */
const dayOf = (text: string) => {
  const t = text.trim();
  if (!t) return null;
  const day = Number(t);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
};

/** Validates the bill sheet. Stopping a bill is separate, so the amount must be more than 0. */
export function parseBillForm(form: FormData): { ok: true; data: BillInput } | { ok: false; errors: BillErrors } {
  const errors: BillErrors = {};

  const amountCents = parseAmountInput(field(form, "amount"));
  if (amountCents === null) errors.amount = AMOUNT_ERROR;

  const name = field(form, "name").trim();
  const nameProblem = nameError(name, "Enter a name.");
  if (nameProblem) errors.name = nameProblem;

  const groupId = field(form, "groupId");
  const newGroup = groupId === NEW_GROUP ? field(form, "newGroup").trim() : null;
  if (newGroup !== null) {
    const groupProblem = nameError(newGroup, "Enter a group name.");
    if (groupProblem) errors.newGroup = groupProblem;
  } else if (!z.uuid().safeParse(groupId).success) errors.groupId = "Choose a group.";

  const dueDay = dayOf(field(form, "dueDay"));
  if (dueDay === undefined) errors.dueDay = DAY_ERROR;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amountCents: amountCents!, name, groupId, newGroup, dueDay: dueDay as number | null } };
}

/** Validates the savings sheet. Removing a plan is separate, so the amount must be more than 0. */
export function parseSavingsForm(
  form: FormData,
): { ok: true; data: SavingsInput } | { ok: false; errors: SavingsErrors } {
  const errors: SavingsErrors = {};
  const amountCents = parseAmountInput(field(form, "amount"));
  if (amountCents === null) errors.amount = AMOUNT_ERROR;
  const name = field(form, "name").trim();
  const nameProblem = nameError(name, "Enter a name.");
  if (nameProblem) errors.name = nameProblem;
  const day = dayOf(field(form, "day"));
  if (day === undefined) errors.day = DAY_ERROR;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amountCents: amountCents!, name, day: day as number | null } };
}

/** Validates the group sheet. Any color is accepted, so a group keeps a color from before the palette. */
export function parseGroupForm(form: FormData): { ok: true; data: GroupInput } | { ok: false; errors: GroupErrors } {
  const errors: GroupErrors = {};
  const name = field(form, "name").trim();
  const nameProblem = nameError(name, "Enter a name.");
  if (nameProblem) errors.name = nameProblem;
  const color = field(form, "color").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) errors.color = "Choose a color.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, color } };
}

/** The color for a new group: the first one no group uses yet, or round again once all are used. */
export function nextGroupColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (GROUP_COLORS.find((c) => !taken.has(c.hex)) ?? GROUP_COLORS[used.length % GROUP_COLORS.length]).hex;
}

export function parseScope(value: FormDataEntryValue | null): ApplyScope | null {
  return value === "month" || value === "later" ? value : null;
}

/** Validates the income sheet. The end date is optional and can't be before `startDate` (sent along with the form). */
export function parseIncomeForm(form: FormData): { ok: true; data: IncomeInput } | { ok: false; errors: IncomeErrors } {
  const errors: IncomeErrors = {};
  const amountCents = parseAmountInput(field(form, "amount"));
  if (amountCents === null) errors.amount = AMOUNT_ERROR;
  const name = field(form, "name").trim();
  const nameProblem = nameError(name, "Enter a name.");
  if (nameProblem) errors.name = nameProblem;
  const frequency = INCOME_FREQUENCIES.find((f) => f.value === field(form, "frequency"))?.value;
  if (!frequency) errors.frequency = "Choose how often.";
  const endDate = field(form, "endDate").trim() || null;
  const startDate = field(form, "startDate");
  if (endDate && !isValidIsoDate(endDate)) errors.endDate = "Enter a date.";
  else if (endDate && isValidIsoDate(startDate) && endDate < startDate)
    errors.endDate = `End on or after ${formatDate(startDate)}.`;
  const categoryId = field(form, "categoryId");
  if (!z.uuid().safeParse(categoryId).success) errors.categoryId = "Choose a category.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amountCents: amountCents!, name, frequency: frequency!, endDate, categoryId } };
}

export type AddIncomeInput = {
  amountCents: number;
  name: string;
  frequency: IncomeFrequency;
  date: string;
  categoryId: string;
};
export type AddIncomeErrors = Partial<Record<"amount" | "name" | "frequency" | "date" | "categoryId", string>>;

/** Validates the Add Income sheet: `date` is the payment date, or the first payment when it repeats. */
export function parseAddIncomeForm(
  form: FormData,
): { ok: true; data: AddIncomeInput } | { ok: false; errors: AddIncomeErrors } {
  const errors: AddIncomeErrors = {};
  const amountCents = parseAmountInput(field(form, "amount"));
  if (amountCents === null) errors.amount = AMOUNT_ERROR;
  const name = field(form, "name").trim();
  const nameProblem = nameError(name, "Enter a name.");
  if (nameProblem) errors.name = nameProblem;
  const frequency = INCOME_FREQUENCIES.find((f) => f.value === field(form, "frequency"))?.value;
  if (!frequency) errors.frequency = "Choose how often.";
  const date = field(form, "date");
  if (!isValidIsoDate(date)) errors.date = "Enter a date.";
  const categoryId = field(form, "categoryId");
  if (!z.uuid().safeParse(categoryId).success) errors.categoryId = "Choose a category.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { amountCents: amountCents!, name, frequency: frequency!, date, categoryId } };
}
