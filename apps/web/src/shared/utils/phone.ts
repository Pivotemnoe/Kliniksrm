export function formatRussianPhone(value?: string | null) {
  const formatted = formatRussianPhoneDraft(value);
  const digitsAfterPrefix = formatted.replace(/\D/g, '').replace(/^7/, '');

  return digitsAfterPrefix ? formatted.trim() : '';
}

export function formatRussianPhoneDraft(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  let rest = digits;

  if (rest.startsWith('8')) {
    rest = rest.slice(1);
  } else if (rest.startsWith('7')) {
    rest = rest.slice(1);
  }

  rest = rest.slice(0, 10);
  const chunks = [
    rest.slice(0, 3),
    rest.slice(3, 6),
    rest.slice(6, 8),
    rest.slice(8, 10),
  ].filter(Boolean);

  return chunks.length ? `+7 ${chunks.join(' ')}` : '+7 ';
}
