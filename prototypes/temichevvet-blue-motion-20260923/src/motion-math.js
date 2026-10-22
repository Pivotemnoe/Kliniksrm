export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export function revealPhase(progress, index, count) {
  return clamp(progress * (1 + (count - 1) * 0.14) - index * 0.14);
}
export function parallaxOffset(scroll, depth, width, off) {
  if (off) return 0;
  const mobile = width < 760;
  return Math.min(scroll, mobile ? 550 : 950) * depth * (mobile ? 0.55 : 1);
}
// Source-image pixels. These are texture-deformation regions, not drawn eyes.
export const petEyes = {
  cat: [
    [584, 337, 43, 34],
    [731, 287, 32, 34],
  ],
  dog: [
    [635, 241, 34, 25],
    [463, 210, 17, 23],
  ],
};
export function gazeOffset(nx, ny, eye) {
  return [clamp(nx, -1, 1) * eye[2] * 0.48, clamp(ny, -1, 1) * eye[3] * 0.32];
}
export function pointGazeTarget(clientX, clientY, width, height) {
  return [
    clamp((clientX / Math.max(width, 1) - 0.5) * 2, -1, 1),
    clamp((clientY / Math.max(height, 1) - 0.5) * 2, -1, 1),
  ];
}
// Scrolling is a separate gaze input: it works without moving the pointer.
export function scrollGazeTarget(current, previous) {
  if (current <= 0) return 0;
  const delta = current - previous;
  return delta === 0 ? null : Math.sign(delta) * clamp(0.72 + Math.abs(delta) / 250, 0, 1);
}
