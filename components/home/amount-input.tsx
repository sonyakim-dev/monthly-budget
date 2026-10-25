import { cleanAmountInput } from '@/lib/domain/money'

/** The Amount field: takes only digits and one decimal point (up to 2 decimals), and shows the number keypad on phones. */
export function AmountInput({ id, name, value, onValueChange, className }: { id: string; name?: string; value: string; onValueChange: (value: string) => void; className?: string }) {
  return (
    <input
      id={id}
      name={name}
      inputMode="decimal"
      autoComplete="off"
      autoFocus
      value={value}
      onChange={(e) => onValueChange(cleanAmountInput(e.target.value))}
      placeholder="0.00"
      className={className}
    />
  )
}
