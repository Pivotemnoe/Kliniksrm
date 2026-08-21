const russianSearchCollator = new Intl.Collator('ru-RU', {
  sensitivity: 'base',
  numeric: true,
});

export function rankSearchResults<T>(
  items: T[],
  search: string | undefined,
  fields: (item: T) => Array<string | null | undefined>,
) {
  const needle = normalize(search);
  if (!needle) return [...items];

  return items
    .map((item, index) => ({ item, index, values: fields(item).map(normalize) }))
    .sort((left, right) => {
      const rankDifference = prefixRank(left.values, needle) - prefixRank(right.values, needle);
      if (rankDifference) return rankDifference;

      const titleDifference = russianSearchCollator.compare(left.values[0] ?? '', right.values[0] ?? '');
      return titleDifference || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function withRussianSearchVariants<T>(
  search: string,
  buildConditions: (variant: string) => T[],
) {
  return russianSearchVariants(search).flatMap(buildConditions);
}

export function russianSearchVariants(search: string | null | undefined) {
  const value = search?.trim();
  if (!value) return [];

  const maxGeneratedVariants = 64;
  let variants = [''];
  for (const character of value) {
    if (character === 'е' || character === 'ё') {
      variants = variants.flatMap((prefix) => [`${prefix}е`, `${prefix}ё`]).slice(0, maxGeneratedVariants);
    } else if (character === 'Е' || character === 'Ё') {
      variants = variants.flatMap((prefix) => [`${prefix}Е`, `${prefix}Ё`]).slice(0, maxGeneratedVariants);
    } else {
      variants = variants.map((prefix) => `${prefix}${character}`);
    }
  }

  return [...new Set([
    value,
    value.replace(/ё/g, 'е').replace(/Ё/g, 'Е'),
    value.replace(/е/g, 'ё').replace(/Е/g, 'Ё'),
    ...variants,
  ])];
}

function prefixRank(values: string[], needle: string) {
  const index = values.findIndex((value) => value.startsWith(needle));
  return index === -1 ? values.length : index;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е') ?? '';
}
