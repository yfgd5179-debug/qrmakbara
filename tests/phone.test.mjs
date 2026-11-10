/**
 * Phone normalisation: one number, one account. Every spelling of the same
 * number must resolve to the same leading lookup candidate, otherwise the
 * registration uniqueness check and the reset flow's write/read steps could
 * land on different rows. Run with `npm test`.
 */
import assert from "node:assert/strict";

const { canonicalPhone, isValidPhone, lookupVariants, phoneVariants, toE164 } =
  await import("../src/lib/phone.ts");

// Same Iraqi number, four ways a customer may type it.
const SPELLINGS = ["07706425337", "+9647706425337", "009647706425337", "9647706425337"];

// 1. Canonical form is identical for every spelling.
for (const raw of SPELLINGS) {
  assert.equal(canonicalPhone(raw), "+9647706425337", `canonical of ${raw}`);
}

// 2. Every spelling leads with the same candidate — the property that makes
//    findUserByPhone row-stable regardless of which form the caller holds.
const leading = new Set(SPELLINGS.map((raw) => lookupVariants(raw)[0]));
assert.equal(leading.size, 1, `lookup candidates diverge: ${[...leading]}`);
assert.equal([...leading][0], "+9647706425337");

// 3. Both the canonical and the legacy national form stay in the candidate
//    list, so accounts stored as "0770…" remain reachable.
const candidates = lookupVariants("07706425337");
assert.ok(candidates.includes("+9647706425337"));
assert.ok(candidates.includes("07706425337"));

// 4. lookupVariants never loses a candidate phoneVariants would try.
for (const raw of [...SPELLINGS, "05321234567", "  +964 770 642 5337  "]) {
  for (const variant of phoneVariants(raw)) {
    assert.ok(
      lookupVariants(raw).includes(variant),
      `lookupVariants(${raw}) dropped ${variant}`
    );
  }
}

// 5. Turkish numbers canonicalise to +90 and stay valid E.164.
assert.equal(canonicalPhone("05321234567"), "+905321234567");
assert.equal(toE164("07706425337"), "+9647706425337");
assert.equal(toE164("+9647706425337"), "+9647706425337");
assert.equal(toE164("12345"), "", "too short is rejected");

// 6. Validity is checked after normalisation, not on the raw string.
assert.ok(isValidPhone("0770 642 5337"));
assert.ok(!isValidPhone("abc"));
assert.ok(!isValidPhone(""));

console.log("PASS  phone: one number -> one canonical form, stable lookup order");
console.log("PASS  phone: national and canonical spellings both reachable");
console.log("PASS  phone: lookupVariants is a superset of phoneVariants");
console.log("PASS  phone: E.164 validation and Turkish normalisation");
