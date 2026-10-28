import type { Field } from "./types.ts";

/**
 * Text handling for the assumptions panel's number fields, and the one rule
 * that ties two fields together.
 *
 * A field's typed text is committed only when the field is left or Enter is
 * pressed: typing "60000" passes through "6000", and committing each valid
 * keystroke would solve the model at an input nobody entered. A value that
 * cannot be used leaves the last committed value in place, and the message
 * names that value.
 */

/** The value as the field shows it while editing: "15,000", "43,000", "5". */
export function formatFieldValue(field: Field, value: number): string {
  if (field.unit === "%") return String(value);
  return value.toLocaleString("en-US");
}

/** The value with its unit, for messages: "15,000 miles", "$43,000", "5% a year". */
export function valueText(field: Field, value: number): string {
  if (field.unit === "$") return `$${value.toLocaleString("en-US")}`;
  if (field.unit === "%") return `${value}% a year`;
  if (field.unit) return `${value.toLocaleString("en-US")} ${field.unit}`;
  return value.toLocaleString("en-US");
}

function rangeText(field: Field): string {
  const show = (x: number) => (field.unit === "$" ? `$${x.toLocaleString("en-US")}` : field.unit === "%" ? `${x}%` : x.toLocaleString("en-US"));
  return `${show(field.min ?? 0)} to ${show(field.max ?? 0)}`;
}

/** The typed text as a number within the field's range, or what is wrong with it. */
export function parseFieldText(field: Field, text: string): { value: number } | { error: string } {
  const cleaned = text.replace(/[,\s$%]/g, "");
  const value = cleaned === "" ? Number.NaN : Number(cleaned);
  if (!Number.isFinite(value)) return { error: `Enter a number from ${rangeText(field)}.` };
  if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
    return { error: `Enter a value from ${rangeText(field)}.` };
  }
  return { value };
}

/** The panel's values the cross-field rule reads. */
export interface Mileages {
  std_miles: number;
  reduced_miles: number;
}

/**
 * Reduced miles must be below standard miles (the route refuses anything
 * else): the third action means keeping the vehicle and driving fewer miles.
 * Returns the message for the field being changed, or null.
 */
export function mileageError(changed: "std_miles" | "reduced_miles", next: Mileages): string | null {
  if (next.reduced_miles < next.std_miles) return null;
  const miles = (x: number) => `${x.toLocaleString("en-US")} miles`;
  return changed === "reduced_miles"
    ? `Reduced miles must be less than standard miles (${miles(next.std_miles)}).`
    : `Standard miles must be more than reduced miles (${miles(next.reduced_miles)}).`;
}

/** What a field shows when its text cannot be used: the problem, then the value still in use. */
export function inUseMessage(field: Field, problem: string, inUse: number): string {
  return `${problem} Still using ${valueText(field, inUse)}.`;
}
