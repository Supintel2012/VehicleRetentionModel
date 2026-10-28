import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFieldValue, inUseMessage, mileageError, parseFieldText, valueText } from "./fields.ts";
import { VEHICLE_RETENTION_TEMPLATE } from "./template.ts";

const field = (id: string) => {
  const found = VEHICLE_RETENTION_TEMPLATE.steps.flatMap((s) => s.questions).find((q) => q.id === id);
  assert.ok(found, id);
  return found;
};
const std = field("std_miles");
const price = field("new_car_price");
const rate = field("discount_rate");

test("typed text is read with separators and units, within the field's range", () => {
  assert.deepEqual(parseFieldText(std, "20,000"), { value: 20_000 });
  assert.deepEqual(parseFieldText(price, "$44,500"), { value: 44_500 });
  assert.deepEqual(parseFieldText(rate, "7.5%"), { value: 7.5 });
  assert.deepEqual(parseFieldText(std, "60000"), { error: "Enter a value from 5,000 to 30,000." });
  assert.deepEqual(parseFieldText(std, ""), { error: "Enter a number from 5,000 to 30,000." });
  assert.deepEqual(parseFieldText(price, "abc"), { error: "Enter a number from $20,000 to $80,000." });
});

test("a refused entry names the value still in use, with its unit", () => {
  assert.equal(inUseMessage(std, "Enter a value from 5,000 to 30,000.", 15_000), "Enter a value from 5,000 to 30,000. Still using 15,000 miles.");
  assert.equal(valueText(price, 43_000), "$43,000");
  assert.equal(valueText(rate, 5), "5% a year");
  assert.equal(formatFieldValue(std, 15_000), "15,000");
  assert.equal(formatFieldValue(rate, 5.5), "5.5");
});

test("reduced miles must stay below standard miles, with the message on the field being changed", () => {
  assert.equal(mileageError("reduced_miles", { std_miles: 15_000, reduced_miles: 14_500 }), null);
  assert.equal(
    mileageError("reduced_miles", { std_miles: 5_000, reduced_miles: 15_000 }),
    "Reduced miles must be less than standard miles (5,000 miles).",
  );
  assert.equal(
    mileageError("std_miles", { std_miles: 8_000, reduced_miles: 8_000 }),
    "Standard miles must be more than reduced miles (8,000 miles).",
  );
});
