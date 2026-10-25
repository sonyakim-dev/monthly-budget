"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  addBill,
  addIncome,
  addSavingsPlan,
  deleteGroup,
  removeBill,
  removeIncome,
  removeSavingsPlan,
  reorderBills,
  reorderGroups,
  saveBill,
  saveGroup,
  saveIncome,
  saveSavingsPlan,
  setIncomeSkipped,
  setPaydaySkipped,
  type PlanFormState,
} from "@/lib/actions/plans";
import type { AmountDetails, BillDetails, GroupDetails, IncomeDetails, SavingsDetails } from "@/lib/budget/bill-details";
import type { Job } from "@/lib/budget/paycheck";
import type { ReviewItem } from "@/components/plan/payslip-review";
import { PaycheckReview, UploadPayslipButton } from "./paycheck-upload";
import { addDays, addMonths, formatDate, formatMonthShort, type MonthKey } from "@/lib/domain/dates";
import { NAME_MAX } from "@/lib/domain/entry-input";
import { centsToDecimal, formatMoney } from "@/lib/domain/money";
import {
  GROUP_COLORS,
  INCOME_FREQUENCIES,
  NEW_GROUP,
  parseAddIncomeForm,
  parseBillForm,
  parseGroupForm,
  parseIncomeForm,
  parseSavingsForm,
  type AddIncomeErrors,
  type ApplyScope,
  type BillErrors,
  type GroupErrors,
  type IncomeErrors,
  type SavingsErrors,
} from "@/lib/domain/plan-input";
import { cn } from "@/lib/utils";
import { AmountInput } from "./amount-input";
import { Sheet, sheetStyles as s } from "./sheet";

type SheetGroup = GroupDetails;

const OFFLINE = "Couldn't save. Check your connection and try again.";

type Open =
  | { kind: "bill"; id: string }
  | { kind: "add" }
  | { kind: "group"; id: string }
  | { kind: "saving"; id: string }
  | { kind: "add-saving" }
  | { kind: "income"; id: string; occurrence?: Occurrence }
  | { kind: "add-income" };
/** The one payment of other income a line stands for, so just that payment can be skipped or put back. */
export type Occurrence = { date: string; skipped: boolean };
const PlanSheetContext = createContext<{
  openBill: (id: string) => void;
  addBill: () => void;
  openGroup: (id: string) => void;
  openSaving: (id: string) => void;
  addSaving: () => void;
  openIncome: (id: string, occurrence?: Occurrence) => void;
  addIncome: () => void;
} | null>(null);

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Holds the month's bills, groups, savings plans and other income and shows their sheets, plus a short notice after removing, restarting or deleting. */
export function PlanSheetProvider({
  bills,
  groups,
  savings,
  incomes,
  incomeCategories,
  defaultDate,
  month,
  children,
}: {
  bills: BillDetails[];
  groups: SheetGroup[];
  savings: SavingsDetails[];
  incomes: IncomeDetails[];
  incomeCategories: { id: string; name: string }[];
  /** Where a new date starts: today in the current month, otherwise the 1st. */
  defaultDate: string;
  month: MonthKey;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ctx = useMemo(
    () => ({
      openBill: (id: string) => setOpen({ kind: "bill", id }),
      addBill: () => setOpen({ kind: "add" }),
      openGroup: (id: string) => setOpen({ kind: "group", id }),
      openSaving: (id: string) => setOpen({ kind: "saving", id }),
      addSaving: () => setOpen({ kind: "add-saving" }),
      openIncome: (id: string, occurrence?: Occurrence) => setOpen({ kind: "income", id, occurrence }),
      addIncome: () => setOpen({ kind: "add-income" }),
    }),
    [],
  );
  const close = () => setOpen(null);
  const bill = open?.kind === "bill" ? bills.find((b) => b.id === open.id) : undefined;
  const group = open?.kind === "group" ? groups.find((g) => g.id === open.id) : undefined;
  const saving = open?.kind === "saving" ? savings.find((p) => p.id === open.id) : undefined;
  const income = open?.kind === "income" ? incomes.find((i) => i.id === open.id) : undefined;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <PlanSheetContext.Provider value={ctx}>
      {children}
      {bill && (
        <BillSheet key={bill.id} bill={bill} groups={groups} month={month} onClose={close} onNotice={setNotice} />
      )}
      {open?.kind === "add" && <AddBillSheet groups={groups} month={month} onClose={close} onNotice={setNotice} />}
      {group && <GroupSheet key={group.id} group={group} groups={groups} onClose={close} onNotice={setNotice} />}
      {saving && <SavingsSheet key={saving.id} plan={saving} month={month} onClose={close} onNotice={setNotice} />}
      {open?.kind === "add-saving" && <AddSavingsSheet month={month} onClose={close} onNotice={setNotice} />}
      {income && (
        <IncomeSheet
          key={income.id}
          plan={income}
          month={month}
          occurrence={open?.kind === "income" ? open.occurrence : undefined}
          categories={incomeCategories}
          onClose={close}
          onNotice={setNotice}
        />
      )}
      {open?.kind === "add-income" && (
        <AddIncomeSheet categories={incomeCategories} defaultDate={defaultDate} onClose={close} onNotice={setNotice} />
      )}
      {notice && (
        <p
          role="status"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#1c1c1a] px-3 py-2 text-xs text-white shadow-lg md:bottom-6"
        >
          {notice}
        </p>
      )}
    </PlanSheetContext.Provider>
  );
}

function usePlanSheet() {
  const ctx = useContext(PlanSheetContext);
  if (!ctx) throw new Error("Plan buttons must be used inside PlanSheetProvider");
  return ctx;
}

/** Makes a bill row tappable to open the bill sheet. */
export function BillButton({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = usePlanSheet();
  return (
    <button type="button" onClick={() => ctx.openBill(id)} className="block w-full text-left hover:bg-[#fbfbf9]">
      {children}
    </button>
  );
}

/** Makes a group header tappable to rename, recolor or delete the group. */
export function GroupButton({
  id,
  name,
  className,
  style,
  children,
}: {
  id: string;
  name: string;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ctx = usePlanSheet();
  return (
    <button
      type="button"
      aria-label={`Edit group ${name}`}
      onClick={() => ctx.openGroup(id)}
      className={cn("w-full text-left hover:brightness-95", className)}
      style={style}
    >
      {children}
    </button>
  );
}

/** Makes a savings plan row tappable to open the savings sheet. */
export function SavingsButton({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = usePlanSheet();
  return (
    <button type="button" onClick={() => ctx.openSaving(id)} className="block w-full text-left hover:bg-[#fbfbf9]">
      {children}
    </button>
  );
}

/** Makes a line of other income (not a paycheck, not a recorded entry) tappable to open the income sheet. */
export function IncomeButton({ id, date, skipped, children }: { id: string; date?: string; skipped?: boolean; children: React.ReactNode }) {
  const ctx = usePlanSheet();
  return (
    <button
      type="button"
      onClick={() => ctx.openIncome(id, date ? { date, skipped: !!skipped } : undefined)}
      className="block w-full text-left hover:bg-[#fbfbf9]"
    >
      {children}
    </button>
  );
}

/** A row that comes from payslips or job settings, so it opens a read-only note instead of an editor. */
export function NoteButton({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left hover:bg-[#fbfbf9]">
        {children}
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <p className="rounded-xl bg-[#f6f6f2] px-3 py-2 text-[13px] text-[#5b5b57]">{note}</p>
        </Sheet>
      )}
    </>
  );
}

/**
 * A paycheck estimated from a job. Its note explains where the figure comes from; the payday can be marked as
 * not happening (skipped) or put back.
 */
export function PaycheckButton({
  jobId,
  date,
  title,
  note,
  skipped,
  jobs = [],
  children,
}: {
  jobId: string;
  date: string;
  title: string;
  note: string;
  skipped: boolean;
  /** Every job with its pay entries; the paycheck's job is found by `jobId`. Lets a payslip be uploaded from here. */
  jobs?: Job[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ReviewItem | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const job = jobs.find((j) => j.id === jobId) ?? null;
  const toggle = () =>
    start(async () => {
      const result = await setPaydaySkipped(jobId, date, !skipped).catch(() => ({ message: OFFLINE }) as PlanFormState);
      if (result.ok) setOpen(false);
      else setMessage(result.message ?? OFFLINE);
    });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left hover:bg-[#fbfbf9]">
        {children}
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <p className="rounded-xl bg-[#f6f6f2] px-3 py-2 text-[13px] text-[#5b5b57]">
            {skipped ? "This payday is marked as skipped, so it isn't counted." : note}
          </p>
          {message && (
            <p role="alert" className="text-sm text-[#c0392b]">
              {message}
            </p>
          )}
          {job && !skipped && (
            <UploadPayslipButton
              job={job}
              date={date}
              onReview={(item) => {
                setReview(item);
                setOpen(false);
              }}
            />
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={pending} onClick={toggle} className={skipped ? s.primary : s.warn}>
              {pending ? "Saving…" : skipped ? "Unskip" : "Skip this payday"}
            </button>
          </div>
        </Sheet>
      )}
      {review && job && <PaycheckReview item={review} job={job} date={date} jobs={jobs} onClose={() => setReview(null)} />}
    </>
  );
}

export function AddIncomeButton() {
  const { addIncome } = usePlanSheet();
  return (
    <button
      type="button"
      onClick={addIncome}
      className="w-full border-b border-[#f1f1ec] px-4 py-2.5 text-left text-[13px] font-semibold text-[#2f7d4f] hover:bg-[#fbfbf9]"
    >
      ＋ Add Income
    </button>
  );
}

export function AddSavingButton() {
  const { addSaving } = usePlanSheet();
  return (
    <button
      type="button"
      onClick={addSaving}
      className="w-full border-b border-[#f1f1ec] px-4 py-2.5 text-left text-[13px] font-semibold text-[#3a6ea5] hover:bg-[#fbfbf9]"
    >
      ＋ Add Saving
    </button>
  );
}

export function AddBillButton() {
  const { addBill } = usePlanSheet();
  return (
    <button
      type="button"
      onClick={addBill}
      className="w-full border-b border-[#f1f1ec] px-4 py-2.5 text-left text-[13px] font-semibold text-[#b7791f] hover:bg-[#fbfbf9]"
    >
      ＋ Add Bill
    </button>
  );
}

function ScopeOption<T extends string>({
  value,
  scope,
  onPick,
  title,
  detail,
  disabled,
}: {
  value: T;
  scope: T;
  onPick: (v: T) => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "relative block rounded-[14px] border border-[#e3e3de] px-3.5 py-2.5 has-[:checked]:border-[#1c1c1a] has-[:checked]:shadow-[inset_0_0_0_1px_#1c1c1a] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#3a6ea5]",
        disabled && "opacity-50",
      )}
    >
      <input
        type="radio"
        name="scope"
        value={value}
        checked={scope === value}
        disabled={disabled}
        onChange={() => onPick(value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-[14px] outline-none disabled:cursor-not-allowed"
      />
      <b className="block text-[15px]">{title}</b>
      <span className="text-xs text-[#8a8a85]">{detail}</span>
    </label>
  );
}

/** Runs a save from a sheet: closes it on success, otherwise shows the field errors or the message. */
function useSheetAction(
  onClose: () => void,
  onNotice: (text: string) => void,
  onErrors: (errors: BillErrors & GroupErrors) => void,
) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<PlanFormState>) =>
    start(async () => {
      let result: PlanFormState;
      try {
        result = await action();
      } catch {
        result = { message: OFFLINE };
      }
      if (result.ok) {
        if (result.notice) onNotice(result.notice);
        onClose();
        return;
      }
      if (result.errors) onErrors(result.errors);
      setMessage(result.message ?? null);
    });
  const alert = message && (
    <p role="alert" className="text-sm text-[#c0392b]">
      {message}
    </p>
  );
  return { pending, run, setMessage, alert };
}

type BillValues = { amount: string; name: string; groupId: string; newGroup: string; dueDay: string };

function formOf(values: Record<string, string>, extra: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...values, ...extra })) fd.set(k, v);
  return fd;
}

/** Amount, Name, Group and Due day: the same fields for editing and adding a bill. */
function BillFields({
  values,
  setValues,
  errors,
  groups,
}: {
  values: BillValues;
  setValues: React.Dispatch<React.SetStateAction<BillValues>>;
  errors: BillErrors;
  groups: SheetGroup[];
}) {
  const set = (key: keyof BillValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  return (
    <>
      <div>
        <label htmlFor="bill-amount" className={s.label}>
          Amount
        </label>
        <AmountInput
          id="bill-amount"
          value={values.amount}
          onValueChange={(amount) => setValues((v) => ({ ...v, amount }))}
          className={cn(s.input, "text-2xl font-bold")}
        />
        {errors.amount && <p className={s.error}>{errors.amount}</p>}
      </div>
      <div>
        <label htmlFor="bill-name" className={s.label}>
          Name
        </label>
        <input id="bill-name" maxLength={NAME_MAX} value={values.name} onChange={set("name")} className={s.input} />
        {errors.name && <p className={s.error}>{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bill-group" className={s.label}>
            Group
          </label>
          <select id="bill-group" value={values.groupId} onChange={set("groupId")} className={s.select}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value={NEW_GROUP}>＋ New group…</option>
          </select>
          {errors.groupId && <p className={s.error}>{errors.groupId}</p>}
        </div>
        <div>
          <label htmlFor="bill-due" className={s.label}>
            Due day
          </label>
          <input
            id="bill-due"
            inputMode="numeric"
            autoComplete="off"
            value={values.dueDay}
            onChange={set("dueDay")}
            placeholder="optional"
            className={s.input}
          />
          {errors.dueDay && <p className={s.error}>{errors.dueDay}</p>}
        </div>
      </div>
      {values.groupId === NEW_GROUP && (
        <div>
          <label htmlFor="bill-new-group" className={s.label}>
            New group name
          </label>
          <input
            id="bill-new-group"
            maxLength={NAME_MAX}
            autoFocus
            value={values.newGroup}
            onChange={set("newGroup")}
            className={s.input}
          />
          {errors.newGroup && <p className={s.error}>{errors.newGroup}</p>}
        </div>
      )}
    </>
  );
}

/** Adds a bill or savings plan from the month being viewed, every month or one time. A removed one with the same name restarts. */
function AddPlanSheet<V extends Record<string, string>>({
  noun,
  month,
  initial,
  fields,
  parse,
  add,
  onClose,
  onNotice,
}: {
  noun: "Bill" | "Saving";
  month: MonthKey;
  initial: V;
  fields: (values: V, setValues: React.Dispatch<React.SetStateAction<V>>, errors: FieldErrors) => React.ReactNode;
  parse: (form: FormData) => Parsed;
  add: (form: FormData) => Promise<PlanFormState>;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [values, setValues] = useState<V>(initial);
  const [scope, setScope] = useState<ApplyScope>("later");
  const [errors, setErrors] = useState<FieldErrors>({});
  const label = formatMonthShort(month);
  const { pending, run, setMessage, alert } = useSheetAction(onClose, onNotice, setErrors);
  const often = useId();

  return (
    <Sheet title={`Add ${noun}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          const form = formOf(values, { month, scope });
          const parsed = parse(form);
          if (!parsed.ok) return setErrors(parsed.errors);
          setErrors({});
          run(() => add(form));
        }}
      >
        {fields(values, setValues, errors)}
        <div role="radiogroup" aria-labelledby={often}>
          <p id={often} className={s.label}>
            How often
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ScopeOption value="later" scope={scope} onPick={setScope} title="Every month" detail={`from ${label}`} />
            <ScopeOption value="month" scope={scope} onPick={setScope} title="One time" detail={`only ${label}`} />
          </div>
        </div>
        {alert}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className={s.primary}>
            {pending ? "Adding…" : `Add ${noun}`}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function AddBillSheet({
  groups,
  month,
  onClose,
  onNotice,
}: {
  groups: SheetGroup[];
  month: MonthKey;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  return (
    <AddPlanSheet<BillValues>
      noun="Bill"
      month={month}
      initial={{ amount: "", name: "", groupId: groups[0]?.id ?? NEW_GROUP, newGroup: "", dueDay: "" }}
      fields={(values, setValues, errors) => (
        <BillFields values={values} setValues={setValues} errors={errors as BillErrors} groups={groups} />
      )}
      parse={parseBillForm}
      add={addBill}
      onClose={onClose}
      onNotice={onNotice}
    />
  );
}

function AddSavingsSheet({
  month,
  onClose,
  onNotice,
}: {
  month: MonthKey;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  return (
    <AddPlanSheet<SavingsValues>
      noun="Saving"
      month={month}
      initial={{ amount: "", name: "", day: "" }}
      fields={(values, setValues, errors) => (
        <SavingsFields values={values} setValues={setValues} errors={errors as SavingsErrors} />
      )}
      parse={parseSavingsForm}
      add={addSavingsPlan}
      onClose={onClose}
      onNotice={onNotice}
    />
  );
}

const ORDER_FAILED = "Couldn't save the order. Check your connection and try again.";

const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th")}`;
};

/** A list order that moves at once and saves in the background; if saving fails it goes back and says so. */
function useOrder(initial: string[], save: (ids: string[]) => Promise<PlanFormState>) {
  const [order, setOrder] = useState(initial);
  const [moved, setMoved] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, start] = useTransition();
  const move = (index: number, by: -1 | 1) => {
    const before = order;
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setOrder(next);
    setMoved(order[index]);
    setMessage(null);
    start(async () => {
      let result: PlanFormState;
      try {
        result = await save(next);
      } catch {
        result = { message: ORDER_FAILED };
      }
      if (!result.ok) {
        setOrder(before);
        setMoved(null);
        setMessage(result.message ?? ORDER_FAILED);
      }
    });
  };
  return { order, move, moved, message };
}

function UpDown({
  label,
  index,
  count,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (index: number, by: -1 | 1) => void;
}) {
  const button =
    "flex h-[26px] w-[30px] items-center justify-center rounded-lg border border-[#e3e3de] bg-white text-[13px] font-semibold text-[#3f3f3b] disabled:border-[#efefea] disabled:text-[#d4d4ce]";
  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
        className={button}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index, 1)}
        className={button}
      >
        ↓
      </button>
    </span>
  );
}

/** Renames, recolors or reorders a group and its bills. Delete works only when the group has no bills at all. */
function GroupSheet({
  group,
  groups,
  onClose,
  onNotice,
}: {
  group: SheetGroup;
  groups: SheetGroup[];
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color.toLowerCase());
  const [errors, setErrors] = useState<GroupErrors>({});
  const { pending, run, setMessage, alert } = useSheetAction(onClose, onNotice, setErrors);
  // A color from before the palette stays on offer, so saving a new name doesn't change it.
  const colors: { hex: string; name: string }[] = GROUP_COLORS.some((c) => c.hex === color)
    ? [...GROUP_COLORS]
    : [{ hex: color, name: "Current color" }, ...GROUP_COLORS];
  const empty = group.billCount === 0;
  // Order applies to every month: it's the bills and groups shown this month that can be moved.
  const bills = useOrder(
    group.shownBills.map((b) => b.id),
    (ids) => reorderBills(group.id, ids),
  );
  const billName = (id: string) => group.shownBills.find((b) => b.id === id)?.name ?? "";
  const shownGroups = useOrder(
    groups.filter((g) => g.shown).map((g) => g.id),
    reorderGroups,
  );
  const position = shownGroups.order.indexOf(group.id);

  return (
    <Sheet title={group.name} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          const form = new FormData();
          form.set("id", group.id);
          form.set("name", name);
          form.set("color", color);
          const parsed = parseGroupForm(form);
          if (!parsed.ok) return setErrors(parsed.errors);
          setErrors({});
          run(() => saveGroup(form));
        }}
      >
        <p className={s.meta}>
          Group · {group.billCount} {group.billCount === 1 ? "bill" : "bills"}
        </p>
        <div>
          <label htmlFor="group-name" className={s.label}>
            Name
          </label>
          <input
            id="group-name"
            maxLength={NAME_MAX}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={s.input}
          />
          {errors.name && <p className={s.error}>{errors.name}</p>}
        </div>
        <div role="radiogroup" aria-labelledby="group-color">
          <p id="group-color" className={s.label}>
            Color
          </p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <input
                key={c.hex}
                type="radio"
                name="color"
                aria-label={c.name}
                value={c.hex}
                checked={color === c.hex}
                onChange={() => setColor(c.hex)}
                style={{ background: c.hex }}
                className="size-[30px] cursor-pointer appearance-none rounded-[9px] border-2 border-transparent outline-none checked:border-[#1c1c1a] checked:shadow-[inset_0_0_0_2px_#fff] focus-visible:ring-2 focus-visible:ring-[#3a6ea5]"
              />
            ))}
          </div>
          {errors.color && <p className={s.error}>{errors.color}</p>}
        </div>
        {bills.order.length > 1 && (
          <div>
            <p className={s.label}>Order</p>
            <ul className="overflow-hidden rounded-xl border border-[#e3e3de]">
              {bills.order.map((id, i) => (
                <li
                  key={id}
                  className={cn(
                    "flex items-center justify-between gap-3 border-t border-[#f1f1ec] px-3 py-2 text-sm first:border-t-0",
                    bills.moved === id && "bg-[#f3f7fb]",
                  )}
                >
                  <span className="truncate">{billName(id)}</span>
                  <UpDown label={billName(id)} index={i} count={bills.order.length} onMove={bills.move} />
                </li>
              ))}
            </ul>
            {bills.message && (
              <p role="alert" className={s.error}>
                {bills.message}
              </p>
            )}
          </div>
        )}
        {position >= 0 && (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[#8a8a85]">
                Group position · {ordinal(position + 1)} of {shownGroups.order.length}
              </p>
              <UpDown label="group" index={position} count={shownGroups.order.length} onMove={shownGroups.move} />
            </div>
            {shownGroups.message && (
              <p role="alert" className={s.error}>
                {shownGroups.message}
              </p>
            )}
          </div>
        )}
        {alert}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={!empty || pending}
            onClick={() => run(() => deleteGroup(group.id))}
            className={cn(s.warn, "disabled:opacity-50")}
          >
            Delete Group
          </button>
          <button type="submit" disabled={pending} className={s.primary}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
        {!empty && <p className="text-xs text-[#8a8a85]">Only an empty group can be deleted.</p>}
      </form>
    </Sheet>
  );
}

type Step = "form" | "apply" | "remove";
type ScopeChoice = { value: string; title: string; detail: string };
type FieldErrors = Partial<Record<string, string>>;
type Parsed = { ok: true; data: { amountCents: number } } | { ok: false; errors: FieldErrors };

/**
 * The sheet for a monthly plan (a bill or savings plan): its fields, then "which months?" when the amount
 * changed, or the Remove question. Name and other details apply to every month, so they don't ask.
 */
function PlanSheet<V extends { amount: string; name: string }>({
  plan,
  month,
  doneWord,
  meta,
  initial,
  fields,
  toForm,
  parse,
  save,
  remove,
  options,
  onClose,
  onNotice,
}: {
  plan: AmountDetails;
  month: MonthKey;
  /** How a recorded payment reads: "paid" for bills, "saved" for savings. */
  doneWord: string;
  /** The line under the title, instead of the month and what was recorded. */
  meta?: string;
  initial: (shownAmount: string) => V;
  fields: (values: V, setValues: React.Dispatch<React.SetStateAction<V>>, errors: FieldErrors) => React.ReactNode;
  toForm: (values: V, extra: Record<string, string>) => FormData;
  parse: (form: FormData) => Parsed;
  save: (form: FormData) => Promise<PlanFormState>;
  remove: (scope: string) => Promise<PlanFormState>;
  /** Other income chooses by payment, not by month: its own choices for "apply to" and "remove", with defaults. */
  options?: { apply: ScopeChoice[]; remove: ScopeChoice[]; defaultApply: string; defaultRemove: string };
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const paidCents = plan.payments.reduce((sum, p) => sum + p.cents, 0);
  const shownCents = plan.payments.length ? paidCents : plan.planCents;
  const several = plan.payments.length > 1;
  const label = formatMonthShort(month);
  const prevLabel = formatMonthShort(addMonths(month, -1));
  const nextLabel = formatMonthShort(addMonths(month, 1));

  const [values, setValues] = useState<V>(() => initial(centsToDecimal(shownCents)));
  const [step, setStep] = useState<Step>("form");
  const [scope, setScope] = useState<string>(options?.defaultApply ?? "later");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [newCents, setNewCents] = useState(shownCents);
  const { pending, run, setMessage, alert } = useSheetAction(onClose, onNotice, (e) => {
    setErrors(e);
    setStep("form");
  });

  const formFor = (withScope?: string) =>
    toForm(values, { id: plan.id, month, ...(withScope && { scope: withScope }) });

  // Save on the form: ask which months only when the amount changed.
  const submit = () => {
    setMessage(null);
    const parsed = parse(formFor());
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    if (parsed.data.amountCents === shownCents) return run(() => save(formFor()));
    setNewCents(parsed.data.amountCents);
    setScope(several ? "later" : options?.defaultApply ?? scope);
    setStep("apply");
  };

  const nextDetail =
    plan.nextCents > 0
      ? `${nextLabel} ${plan.nextHasOwn ? "stays" : "goes back to"} ${formatMoney(plan.nextCents)}`
      : `Nothing planned in ${nextLabel}`;
  const laterDetail = `${prevLabel} and earlier don't change`;
  const severalDetail = `${plan.payments.length} recorded this month, so only later months can change here`;

  const title = step === "form" ? plan.name : step === "apply" ? (options ? "Apply to which payments?" : "Apply to which months?") : `Remove ${plan.name}?`;

  return (
    <Sheet title={title} onClose={onClose}>
      {step === "form" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className={s.meta}>
            {meta ??
              (plan.payments.length
              ? `${label} · ${doneWord} ${shortDate(plan.payments[0].date)}${several ? ` and ${plan.payments.length - 1} more` : ""} · plan ${formatMoney(plan.planCents)}`
              : `${label} · planned`)}
          </p>
          {fields(values, setValues, errors)}
          {alert}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setScope(options?.defaultRemove ?? "later");
                setStep("remove");
              }}
              className={s.warn}
            >
              Remove
            </button>
            <button type="submit" disabled={pending} className={s.primary}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {step === "apply" && (
            <p className="flex items-baseline gap-2 pb-1 text-[13px]">
              <span>{values.name.trim() || plan.name}</span>
              <s className="text-[#8a8a85]">{formatMoney(shownCents)}</s>
              <span>→</span>
              <b className="text-lg">{formatMoney(newCents)}</b>
            </p>
          )}
          <div role="radiogroup" aria-label="Apply to" className="space-y-2">
            {options ? (
              (step === "remove" ? options.remove : options.apply).map((o) => (
                <ScopeOption key={o.value} value={o.value} scope={scope} onPick={setScope} title={o.title} detail={o.detail} />
              ))
            ) : (
              <>
            <ScopeOption
              value="month"
              scope={scope}
              onPick={setScope}
              title={`Only ${label}`}
              detail={
                step === "remove"
                  ? plan.nextCents > 0
                    ? `Skip this month. ${formatMoney(plan.nextCents)} again from ${nextLabel}`
                    : "Skip this month"
                  : several
                    ? severalDetail
                    : nextDetail
              }
              disabled={step === "apply" && several}
            />
            <ScopeOption
              value="later"
              scope={scope}
              onPick={setScope}
              title={`${label} and later`}
              detail={laterDetail}
            />
              </>
            )}
          </div>
          {alert}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setStep("form");
              }}
              className={s.secondary}
            >
              Back
            </button>
            {step === "apply" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => save(formFor(scope)))}
                className={s.primary}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => remove(scope))}
                className={s.danger}
              >
                {pending ? "Removing…" : scope === "one" ? "Remove this payment" : `Remove ${plan.name}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function BillSheet({
  bill,
  groups,
  month,
  onClose,
  onNotice,
}: {
  bill: BillDetails;
  groups: SheetGroup[];
  month: MonthKey;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  return (
    <PlanSheet<BillValues>
      plan={bill}
      month={month}
      doneWord="paid"
      initial={(amount) => ({
        amount,
        name: bill.name,
        groupId: bill.groupId,
        newGroup: "",
        dueDay: bill.dueDay?.toString() ?? "",
      })}
      fields={(values, setValues, errors) => (
        <BillFields values={values} setValues={setValues} errors={errors as BillErrors} groups={groups} />
      )}
      toForm={formOf}
      parse={parseBillForm}
      save={saveBill}
      remove={(scope) => removeBill(bill.id, month, scope)}
      onClose={onClose}
      onNotice={onNotice}
    />
  );
}

type SavingsValues = { amount: string; name: string; day: string };

function SavingsSheet({
  plan,
  month,
  onClose,
  onNotice,
}: {
  plan: SavingsDetails;
  month: MonthKey;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  return (
    <PlanSheet<SavingsValues>
      plan={plan}
      month={month}
      doneWord="saved"
      initial={(amount) => ({ amount, name: plan.name, day: plan.day?.toString() ?? "" })}
      fields={(values, setValues, errors) => (
        <SavingsFields values={values} setValues={setValues} errors={errors as SavingsErrors} />
      )}
      toForm={formOf}
      parse={parseSavingsForm}
      save={saveSavingsPlan}
      remove={(scope) => removeSavingsPlan(plan.id, month, scope)}
      onClose={onClose}
      onNotice={onNotice}
    />
  );
}

/** Amount, Name and Day for a savings plan. */
function SavingsFields({
  values,
  setValues,
  errors,
}: {
  values: SavingsValues;
  setValues: React.Dispatch<React.SetStateAction<SavingsValues>>;
  errors: SavingsErrors;
}) {
  return (
    <>
      <div>
        <label htmlFor="saving-amount" className={s.label}>
          Amount
        </label>
        <AmountInput
          id="saving-amount"
          value={values.amount}
          onValueChange={(amount) => setValues((v) => ({ ...v, amount }))}
          className={cn(s.input, "text-2xl font-bold")}
        />
        {errors.amount && <p className={s.error}>{errors.amount}</p>}
      </div>
      <div>
        <label htmlFor="saving-name" className={s.label}>
          Name
        </label>
        <input
          id="saving-name"
          maxLength={NAME_MAX}
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className={s.input}
        />
        {errors.name && <p className={s.error}>{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="saving-day" className={s.label}>
            Day
          </label>
          <input
            id="saving-day"
            inputMode="numeric"
            autoComplete="off"
            value={values.day}
            onChange={(e) => setValues((v) => ({ ...v, day: e.target.value }))}
            placeholder="optional"
            className={s.input}
          />
          {errors.day && <p className={s.error}>{errors.day}</p>}
        </div>
      </div>
    </>
  );
}

type IncomeValues = { amount: string; name: string; frequency: string; endDate: string; categoryId: string };

const FREQUENCY_TEXT: Record<IncomeDetails["frequency"], string> = {
  once: "Once",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Every month",
};

function IncomeSheet({
  plan,
  month,
  occurrence,
  categories,
  onClose,
  onNotice,
}: {
  plan: IncomeDetails;
  month: MonthKey;
  /** The payment the sheet was opened from: changes and removals are relative to it. */
  occurrence?: Occurrence;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const since = plan.frequency === "once" ? `on ${formatDate(plan.startDate)}` : `since ${formatDate(plan.startDate)}`;
  const until = plan.endDate ? ` · until ${formatDate(plan.endDate)}` : "";
  if (occurrence?.skipped) return <SkippedIncomeSheet plan={plan} date={occurrence.date} onClose={onClose} onNotice={onNotice} />;
  // Without a payment to stand on (shouldn't happen from Home), changes count from the start of the month.
  const date = occurrence?.date ?? `${month}-01`;
  const day = formatDate(date);
  const repeating = plan.frequency !== "once";
  const all = { value: "all", title: "All payments", detail: `Every payment, from ${formatDate(plan.startDate)}` };
  const options = {
    apply: repeating
      ? [
          { value: "one", title: "Only this payment", detail: `${day} is recorded for the new amount; the plan stays` },
          all,
          { value: "later", title: "This and later payments", detail: `From ${day} on. Earlier payments don't change` },
        ]
      : [all],
    remove: repeating
      ? [
          { value: "one", title: "Just this payment", detail: `Skip ${day} only. The others stay` },
          { value: "later", title: "This and later payments", detail: `${plan.name} ends after ${formatDate(addDays(date, -1))}` },
          { value: "all", title: "All payments", detail: `${plan.name} goes away. Payments already recorded stay` },
        ]
      : [{ value: "all", title: "This payment", detail: `${plan.name} goes away` }],
    defaultApply: repeating ? "later" : "all",
    defaultRemove: repeating ? "one" : "all",
  };
  return (
    <PlanSheet<IncomeValues>
      plan={plan}
      month={month}
      doneWord="received"
      meta={`${FREQUENCY_TEXT[plan.frequency]} ${since}${until}`}
      initial={(amount) => ({ amount, name: plan.name, frequency: plan.frequency, endDate: plan.endDate ?? "", categoryId: plan.categoryId })}
      fields={(values, setValues, errors) => (
        <IncomeFields values={values} setValues={setValues} errors={errors as IncomeErrors} categories={categories} />
      )}
      toForm={(values, extra) => formOf(values, { ...extra, startDate: plan.startDate, date })}
      parse={parseIncomeForm}
      save={saveIncome}
      remove={(scope) => removeIncome(plan.id, date, scope)}
      options={options}
      onClose={onClose}
      onNotice={onNotice}
    />
  );
}

/** A payment of other income marked as skipped: it isn't counted; it can be put back. */
function SkippedIncomeSheet({
  plan,
  date,
  onClose,
  onNotice,
}: {
  plan: IncomeDetails;
  date: string;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const { pending, run, alert } = useSheetAction(onClose, onNotice, () => {});
  return (
    <Sheet title={plan.name} onClose={onClose}>
      <p className="rounded-xl bg-[#f6f6f2] px-3 py-2 text-[13px] text-[#5b5b57]">
        The payment on {formatDate(date)} is marked as skipped, so it isn&apos;t counted. The plan itself is unchanged.
      </p>
      {alert}
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={pending} onClick={() => run(() => setIncomeSkipped(plan.id, date, false))} className={s.primary}>
          {pending ? "Saving…" : "Unskip this payment"}
        </button>
      </div>
    </Sheet>
  );
}

/** Amount per payment, Name, How often and an optional end date for other income. */
function IncomeFields({
  values,
  setValues,
  errors,
  categories,
}: {
  values: IncomeValues;
  setValues: React.Dispatch<React.SetStateAction<IncomeValues>>;
  errors: IncomeErrors;
  categories: { id: string; name: string }[];
}) {
  const set = (key: keyof IncomeValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  return (
    <>
      <div>
        <label htmlFor="income-amount" className={s.label}>
          Amount per payment
        </label>
        <AmountInput
          id="income-amount"
          value={values.amount}
          onValueChange={(amount) => setValues((v) => ({ ...v, amount }))}
          className={cn(s.input, "text-2xl font-bold")}
        />
        {errors.amount && <p className={s.error}>{errors.amount}</p>}
      </div>
      <div>
        <label htmlFor="income-name" className={s.label}>
          Name
        </label>
        <input id="income-name" maxLength={NAME_MAX} value={values.name} onChange={set("name")} className={s.input} />
        {errors.name && <p className={s.error}>{errors.name}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="income-frequency" className={s.label}>
            How often
          </label>
          <select id="income-frequency" value={values.frequency} onChange={set("frequency")} className={s.select}>
            {INCOME_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {errors.frequency && <p className={s.error}>{errors.frequency}</p>}
        </div>
        <div>
          <label htmlFor="income-end" className={s.label}>
            Ends
          </label>
          <input id="income-end" type="date" value={values.endDate} onChange={set("endDate")} className={s.input} />
          {errors.endDate && <p className={s.error}>{errors.endDate}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="income-category" className={s.label}>
          Category
        </label>
        <select id="income-category" value={values.categoryId} onChange={set("categoryId")} className={s.select}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.categoryId && <p className={s.error}>{errors.categoryId}</p>}
      </div>
    </>
  );
}

/** Adds other income (not a paycheck): once on a date, or repeating from its first payment. */
function AddIncomeSheet({
  categories,
  defaultDate,
  onClose,
  onNotice,
}: {
  categories: { id: string; name: string }[];
  defaultDate: string;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [values, setValues] = useState({
    amount: "",
    name: "",
    frequency: "once",
    date: defaultDate,
    categoryId: (categories.find((c) => c.name === "Side income") ?? categories[0])?.id ?? "",
  });
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const [errors, setErrors] = useState<AddIncomeErrors>({});
  const { pending, run, setMessage, alert } = useSheetAction(onClose, onNotice, setErrors);

  return (
    <Sheet title="Add Income" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          const form = formOf(values, {});
          const parsed = parseAddIncomeForm(form);
          if (!parsed.ok) return setErrors(parsed.errors);
          setErrors({});
          run(() => addIncome(form));
        }}
      >
        <div>
          <label htmlFor="add-income-amount" className={s.label}>
            Amount
          </label>
          <AmountInput
            id="add-income-amount"
            value={values.amount}
            onValueChange={(amount) => setValues((v) => ({ ...v, amount }))}
            className={cn(s.input, "text-2xl font-bold")}
          />
          {errors.amount && <p className={s.error}>{errors.amount}</p>}
        </div>
        <div>
          <label htmlFor="add-income-name" className={s.label}>
            Name
          </label>
          <input id="add-income-name" maxLength={NAME_MAX} value={values.name} onChange={set("name")} className={s.input} />
          {errors.name && <p className={s.error}>{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="add-income-frequency" className={s.label}>
              How often
            </label>
            <select id="add-income-frequency" value={values.frequency} onChange={set("frequency")} className={s.select}>
              {INCOME_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {errors.frequency && <p className={s.error}>{errors.frequency}</p>}
          </div>
          <div>
            <label htmlFor="add-income-date" className={s.label}>
              {values.frequency === "once" ? "Date" : "First payment"}
            </label>
            <input id="add-income-date" type="date" value={values.date} onChange={set("date")} className={s.input} />
            {errors.date && <p className={s.error}>{errors.date}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="add-income-category" className={s.label}>
            Category
          </label>
          <select id="add-income-category" value={values.categoryId} onChange={set("categoryId")} className={s.select}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <p className={s.error}>{errors.categoryId}</p>}
        </div>
        {alert}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className={s.primary}>
            {pending ? "Adding…" : "Add Income"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
