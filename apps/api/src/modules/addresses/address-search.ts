const noise = new Set(['россия', 'рф', 'край', 'область', 'обл', 'район', 'рн', 'г', 'город', 'с', 'село', 'п', 'пос', 'поселок', 'ст', 'стца', 'станица', 'ул', 'улица', 'пер', 'переулок', 'пр', 'пркт', 'проспект', 'д', 'дом', 'корп', 'корпус', 'стр', 'строение']);

export function addressSearchQuery(input: string) {
  // Apartment is free text and must never be mistaken for a house number.
  const query = input.toLocaleLowerCase('ru').replace(/ё/g, 'е').split(/(?:^|[\s,])(?:кв\.?|квартира|офис)\s*\d/u)[0];
  const tokens = [...new Set((query.match(/[а-яa-z0-9]+/gu) ?? []).filter((word) => !noise.has(word)))].slice(0, 16);
  return {
    tsquery: tokens.map((word) => `${word}:*`).join(' & '),
    hasNumber: tokens.some((word) => /\d/u.test(word)),
    valid: tokens.some((word) => word.length >= 2),
  };
}
