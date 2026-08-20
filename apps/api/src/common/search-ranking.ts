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

function prefixRank(values: string[], needle: string) {
  const index = values.findIndex((value) => value.startsWith(needle));
  return index === -1 ? values.length : index;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('ru-RU') ?? '';
}
