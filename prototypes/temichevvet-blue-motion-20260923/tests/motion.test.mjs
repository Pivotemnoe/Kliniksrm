import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parallaxOffset,
  revealPhase,
  gazeOffset,
  pointGazeTarget,
  petEyes,
  scrollGazeTarget,
} from "../src/motion-math.js";
test("scroll alone looks down, reverse scroll looks up, top is neutral", () => {
  assert.ok(scrollGazeTarget(80, 0) > 0.7);
  assert.ok(scrollGazeTarget(80, 160) < -0.7);
  assert.equal(scrollGazeTarget(0, 80), 0);
  assert.equal(scrollGazeTarget(80, 80), null);
  assert.equal(scrollGazeTarget(3000, 0), 1);
});

test("parallax has distinct planes, opposing copy, bounded scroll and reduced-motion zero", () => {
  assert.deepEqual(
    [0.28, 0.13, 0.21, -0.045].map((d) => parallaxOffset(500, d, 1280, false)),
    [140, 65, 105, -22.5],
  );
  assert.equal(parallaxOffset(500, 0.28, 1280, true), 0);
  assert.ok(Math.abs(parallaxOffset(500, -0.045, 390, false) + 12.375) < 1e-9);
  assert.equal(parallaxOffset(1000, 0.28, 390, false), parallaxOffset(550, 0.28, 390, false));
  assert.equal(
    parallaxOffset(2000, 0.28, 1280, false),
    parallaxOffset(950, 0.28, 1280, false),
  );
});
test("words reveal progressively and every word reaches full visibility", () => {
  for (let i = 0; i < 6; i++) {
    assert.equal(revealPhase(0, i, 6), 0);
    assert.equal(revealPhase(1, i, 6), 1);
  }
  assert.ok(revealPhase(0.5, 0, 6) > revealPhase(0.5, 5, 6));
});
test("eye displacement stays within iris and resets to neutral", () => {
  for (const eyes of Object.values(petEyes))
    for (const eye of eyes) {
      assert.deepEqual(gazeOffset(0, 0, eye), [0, 0]);
      const offset = gazeOffset(100, -100, eye);
      assert.ok(offset[0] < eye[2] / 2);
      assert.ok(Math.abs(offset[1]) < eye[3] / 3);
      assert.deepEqual(gazeOffset(1, -1, eye), offset);
    }
});
test("mobile gaze follows finger coordinates while preserving bounds", async () => {
  assert.deepEqual(pointGazeTarget(215, 430, 430, 860), [0, 0]);
  assert.deepEqual(pointGazeTarget(0, 860, 430, 860), [-1, 1]);
  assert.deepEqual(pointGazeTarget(1000, -100, 430, 860), [1, -1]);
  const motion = await readFile(new URL("../src/motion.js", import.meta.url), "utf8");
  assert.match(motion, /addEventListener\("touchmove", touch, \{ passive: true \}\)/);
  assert.match(motion, /!touching && scrollLook !== null/);
  const portrait = await readFile(new URL("../src/PetPortrait.jsx", import.meta.url), "utf8");
  assert.match(portrait, /UNPACK_PREMULTIPLY_ALPHA_WEBGL/);
});
test("educational routes expose real keyboard controls, separate illustrations from photos and do not send data", async () => {
  const html = await readFile(
    new URL("../dist/client/pets/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /role="slider" tabindex="0"/);
  assert.match(html, /aria-valuenow="50"/);
  assert.match(html, /не диагностические изображения/);
  const tooth = await readFile(
    new URL("../dist/client/services/dentistry/index.html", import.meta.url),
    "utf8",
  );
  assert.match(tooth, /Разобрать зуб на слои/);
  assert.match(tooth, /tooth-layer-pulp.webp/);
  for (const file of ["ClinicTour.jsx", "Explore.jsx", "PetPortrait.jsx"]) {
    const source = await readFile(
      new URL("../src/" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
  }
});
test("clinic journey uses existing real photos and retains phone-only final handoff", async () => {
  const html = await readFile(
    new URL("../dist/client/index.html", import.meta.url),
    "utf8",
  );
  for (const image of [
    "reception-real",
    "ultrasound-real",
    "laboratory-real",
    "inpatient-noninfectious-real",
  ])
    assert.ok(html.includes(image));
  assert.match(html, /Фотопрогулка по клинике/);
  assert.match(html, /Включить подсветку деталей/);
  const source = await readFile(
    new URL("../src/ClinicTour.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /href=\{clinic.tel\}/);
});
