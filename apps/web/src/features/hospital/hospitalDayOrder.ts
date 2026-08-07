export function compareHospitalDayKeys(leftKey: string, rightKey: string, todayKey: string) {
  if (leftKey === rightKey) return 0;
  if (leftKey === todayKey) return -1;
  if (rightKey === todayKey) return 1;

  const leftIsPast = leftKey < todayKey;
  const rightIsPast = rightKey < todayKey;
  if (leftIsPast !== rightIsPast) return leftIsPast ? 1 : -1;

  return leftIsPast
    ? rightKey.localeCompare(leftKey)
    : leftKey.localeCompare(rightKey);
}
