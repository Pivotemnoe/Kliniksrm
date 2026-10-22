import test from "node:test";
import assert from "node:assert/strict";
import { checkupProgram, checkupProfiles, checkupVisitHref, getCheckupVisitContext } from "../src/checkup-programs.js";

test("all eight published package totals match the owner price photo and profile addition", () => {
  const expected = [
    ["cat", "clinic", "standard", 5300, 4700], ["cat", "invitro", "standard", 6100, 5750],
    ["cat", "clinic", "expanded", 7400, 6450], ["cat", "invitro", "expanded", 8200, 7500],
    ["dog", "clinic", "standard", 5550, 4700], ["dog", "invitro", "standard", 6350, 5750],
    ["dog", "clinic", "expanded", 15550, 13900], ["dog", "invitro", "expanded", 16350, 14950],
  ];
  for (const [species, lab, program, regular, price] of expected) {
    assert.deepEqual([checkupProgram(species, lab, program).regular, checkupProgram(species, lab, program).price], [regular, price]);
    if (program === "expanded") {
      const standard = checkupProgram(species, lab, "standard"), profile = checkupProfiles[species];
      assert.equal(price, standard.price + profile.price);
      assert.equal(regular, standard.regular + profile.regular);
    }
    const context = getCheckupVisitContext(checkupVisitHref(species, lab, program).split("?")[1]);
    assert.ok(context.message.includes(program === "standard" ? "стандартная" : "расширенная"));
    assert.ok(context.message.includes(lab === "clinic" ? "в клинике" : "в Инвитро"));
  }
});
test("request context accepts only approved species, laboratory and program", () => {
  for (const search of ["", "?checkup=cat-invitro-standard-extra", "?checkup=cat-unknown-standard", "?checkup=__proto__-clinic-standard", "?checkup=cat-clinic-free"]) assert.equal(getCheckupVisitContext(search), null);
});
