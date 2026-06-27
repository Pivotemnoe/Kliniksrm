import { AutoComplete, Input } from 'antd';
import type { InputProps } from 'antd';
import { useMemo } from 'react';

type AddressAutocompleteProps = Omit<InputProps, 'onChange'> & {
  value?: string;
  onChange?: (value: string) => void;
};

type LocalityPreset = {
  label: string;
  aliases: string[];
  streets?: string[];
};

const commonStreets = [
  'ул. Ленина',
  'ул. Мира',
  'ул. Советская',
  'ул. Комсомольская',
  'ул. Октябрьская',
  'ул. Красная',
  'ул. Кирова',
  'ул. Гагарина',
  'ул. Пушкина',
  'ул. Горького',
  'ул. Калинина',
  'ул. Садовая',
  'ул. Школьная',
  'ул. Набережная',
  'ул. Молодёжная',
  'ул. Первомайская',
  'ул. Пролетарская',
  'ул. Почтовая',
  'ул. Степная',
  'ул. Центральная',
  'ул. Южная',
  'ул. Северная',
  'ул. Восточная',
  'ул. Западная',
  'ул. Заречная',
  'ул. Парковая',
  'ул. Полевая',
  'ул. Рабочая',
  'ул. Ставропольская',
  'ул. Кубанская',
  'пер. Школьный',
  'пер. Садовый',
  'пер. Центральный',
  'пер. Южный',
  'пер. Северный',
];

const armavirStreets = [
  'ул. Кирова',
  'ул. Ленина',
  'ул. Луначарского',
  'ул. Мира',
  'ул. Советской Армии',
  'ул. Тургенева',
  'ул. Ефремова',
  'ул. Новороссийская',
  'ул. Розы Люксембург',
  'ул. Карла Маркса',
  'ул. Володарского',
  'ул. Дзержинского',
  'ул. Комсомольская',
  'ул. Маркова',
  'ул. Шаумяна',
  'ул. Энгельса',
  'ул. Азовская',
  'ул. Урицкого',
  'ул. Халтурина',
  'ул. Матвеева',
  'ул. Пугачёва',
  'ул. Каспарова',
  'ул. Чичерина',
  'ул. Воровского',
  'ул. Свердлова',
  'ул. Кропоткина',
  'ул. Краснофлотская',
  'ул. Красина',
  'ул. Кавказская',
  'ул. Тоннельная',
  'ул. Железнодорожная',
  'ул. Привокзальная',
  'ул. Пролетарская',
  'ул. Песчаная',
  'ул. Сочинская',
  'ул. Черноморская',
  'ул. Кубанская',
  'ул. Ставропольская',
  'ул. Урупская',
  'ул. Майкопская',
  'ул. Нефтяников',
  'ул. Российская',
  'ул. Северная',
  'ул. Южная',
  'ул. Восточная',
  'ул. Западная',
  'ул. Полевая',
  'ул. Садовая',
  'ул. Шоссейная',
  'ул. Лавриненко',
  'ул. Туапсинская',
  'ул. Анапская',
  'ул. Краснодарская',
  'ул. 30 лет Победы',
  'ул. 40 лет Победы',
  'ул. 50 лет Октября',
  'ул. 8 Марта',
  'ул. 1-я Линия',
  'ул. 2-я Линия',
  'ул. 3-я Линия',
  'ул. 4-я Линия',
  'ул. 5-я Линия',
  'ул. 6-я Линия',
  'ул. 7-я Линия',
  'ул. 8-я Линия',
  'ул. 9-я Линия',
  'ул. 10-я Линия',
  'ул. 11-я Линия',
  'ул. 12-я Линия',
  'ул. 13-я Линия',
  'ул. 14-я Линия',
  'ул. 15-я Линия',
  'ул. 16-я Линия',
  'ул. 17-я Линия',
  'ул. 18-я Линия',
  'ул. 19-я Линия',
  'ул. 20-я Линия',
  'пер. Черноморский',
  'пер. Северный',
  'пер. Восточный',
  'пер. Южный',
  'пер. Западный',
  'пер. Кубанский',
  'пер. Садовый',
  'пер. Пролетарский',
  'пер. Краснофлотский',
  'пер. Школьный',
];

const armavirAreaStreets = unique([
  ...commonStreets,
  'ул. Офицерская',
  'ул. Шоссейная',
  'ул. Российская',
  'ул. Краснодарская',
  'ул. Кавказская',
  'ул. Кубанская',
  'ул. Майкопская',
  'ул. Урупская',
]);

const localityPresets: LocalityPreset[] = [
  { label: 'Краснодарский край, г. Армавир', aliases: ['армавир', 'г армавир'], streets: armavirStreets },
  { label: 'Краснодарский край, г. Краснодар', aliases: ['краснодар', 'г краснодар'] },
  { label: 'Краснодарский край, г. Новокубанск', aliases: ['новокубанск', 'г новокубанск'] },
  { label: 'Краснодарский край, г. Курганинск', aliases: ['курганинск', 'г курганинск'] },
  { label: 'Краснодарский край, г. Лабинск', aliases: ['лабинск', 'г лабинск'] },
  { label: 'Краснодарский край, г. Кропоткин', aliases: ['кропоткин', 'г кропоткин'] },
  { label: 'Краснодарский край, г. Гулькевичи', aliases: ['гулькевичи', 'г гулькевичи'] },
  { label: 'Краснодарский край, г. Белореченск', aliases: ['белореченск', 'г белореченск'] },
  { label: 'Краснодарский край, г. Апшеронск', aliases: ['апшеронск', 'г апшеронск'] },
  { label: 'Краснодарский край, г. Горячий Ключ', aliases: ['горячий ключ', 'г горячий ключ'] },
  { label: 'Краснодарский край, г. Усть-Лабинск', aliases: ['усть лабинск', 'усть-лабинск', 'г усть лабинск'] },
  { label: 'Краснодарский край, г. Тихорецк', aliases: ['тихорецк', 'г тихорецк'] },
  { label: 'Краснодарский край, г. Кореновск', aliases: ['кореновск', 'г кореновск'] },
  { label: 'Краснодарский край, г. Тимашевск', aliases: ['тимашевск', 'г тимашевск'] },
  { label: 'Краснодарский край, г. Славянск-на-Кубани', aliases: ['славянск', 'славянск на кубани'] },
  { label: 'Краснодарский край, г. Крымск', aliases: ['крымск', 'г крымск'] },
  { label: 'Краснодарский край, г. Абинск', aliases: ['абинск', 'г абинск'] },
  { label: 'Краснодарский край, г. Новороссийск', aliases: ['новороссийск', 'г новороссийск'] },
  { label: 'Краснодарский край, г. Анапа', aliases: ['анапа', 'г анапа'] },
  { label: 'Краснодарский край, г. Сочи', aliases: ['сочи', 'г сочи'] },
  { label: 'Краснодарский край, г. Туапсе', aliases: ['туапсе', 'г туапсе'] },
  { label: 'Краснодарский край, г. Ейск', aliases: ['ейск', 'г ейск'] },
  { label: 'Краснодарский край, ст-ца Успенская', aliases: ['успенская', 'успенское'] },
  { label: 'Краснодарский край, ст-ца Отрадная', aliases: ['отрадная'] },
  { label: 'Краснодарский край, ст-ца Кавказская', aliases: ['кавказская'] },
  { label: 'Краснодарский край, ст-ца Тбилисская', aliases: ['тбилисская'] },
  { label: 'Краснодарский край, ст-ца Динская', aliases: ['динская'] },
  { label: 'Краснодарский край, ст-ца Выселки', aliases: ['выселки'] },
  { label: 'Краснодарский край, ст-ца Северская', aliases: ['северская'] },
  { label: 'Краснодарский край, ст-ца Каневская', aliases: ['каневская'] },
  { label: 'Краснодарский край, ст-ца Брюховецкая', aliases: ['брюховецкая'] },
  { label: 'Краснодарский край, ст-ца Павловская', aliases: ['павловская'] },
  { label: 'Краснодарский край, ст-ца Староминская', aliases: ['староминская'] },
  { label: 'Краснодарский край, ст-ца Ленинградская', aliases: ['ленинградская'] },
  { label: 'Краснодарский край, ст-ца Крыловская', aliases: ['крыловская'] },
  { label: 'Краснодарский край, ст-ца Кущёвская', aliases: ['кущевская', 'кущёвская'] },
  { label: 'Краснодарский край, ст-ца Новопокровская', aliases: ['новопокровская'] },
  { label: 'Краснодарский край, ст-ца Белая Глина', aliases: ['белая глина'] },
  { label: 'Краснодарский край, с. Успенское', aliases: ['с успенское', 'село успенское'] },
  { label: 'Краснодарский край, с. Коноково', aliases: ['коноково'] },
  { label: 'Краснодарский край, с. Вольное', aliases: ['вольное'] },
  {
    label: 'Краснодарский край, г. Армавир, п. Заветный',
    aliases: ['заветный', 'п заветный', 'пос заветный', 'поселок заветный', 'посёлок заветный', 'армавир заветный'],
    streets: armavirAreaStreets,
  },
  {
    label: 'Краснодарский край, г. Армавир, п. Южный',
    aliases: ['южный', 'п южный', 'пос южный', 'поселок южный', 'посёлок южный', 'армавир южный'],
    streets: armavirAreaStreets,
  },
  { label: 'Краснодарский край, п. Мостовской', aliases: ['мостовской'] },
];

const defaultOptions = [
  'Краснодарский край',
  'Краснодарский край, г. Армавир',
  'Краснодарский край, г. Новокубанск',
  'Краснодарский край, г. Курганинск',
  'Краснодарский край, ст-ца Успенская',
];

export function AddressAutocomplete({ value, onChange, placeholder = 'Город, улица, дом, квартира', ...props }: AddressAutocompleteProps) {
  const options = useMemo(() => buildAddressOptions(value), [value]);

  return (
    <AutoComplete
      value={value}
      options={options.map((item) => ({ value: item }))}
      filterOption={false}
      onChange={(nextValue) => onChange?.(nextValue)}
      onSelect={(nextValue) => onChange?.(nextValue)}
    >
      <Input {...props} placeholder={placeholder} />
    </AutoComplete>
  );
}

function buildAddressOptions(value?: string) {
  const rawValue = value?.trim() ?? '';
  const query = normalizeAddress(rawValue);

  if (!query) {
    return defaultOptions;
  }

  const selectedLocality = findSelectedLocality(query) ?? localityPresets[0];
  const localityMatches = localityPresets
    .filter((locality) => matchesLocality(locality, query))
    .map((locality) => locality.label);
  const streetWords = getStreetWords(query, selectedLocality);
  const streets = selectedLocality.streets ?? commonStreets;
  const houseNumber = getHouseNumber(rawValue);
  const streetMatches = streets
    .filter((street) => !streetWords.length || matchesStreet(street, streetWords))
    .slice(0, streetWords.length ? 14 : 8)
    .map((street) => formatAddressSuggestion(selectedLocality.label, street, houseNumber));
  const customStreetSuggestion = buildCustomStreetSuggestion(selectedLocality, streets, streetWords, houseNumber);
  const streetSuggestions = unique([...streetMatches, ...(customStreetSuggestion ? [customStreetSuggestion] : [])]);

  return unique([
    ...defaultOptions.filter((option) => normalizeAddress(option).includes(query)),
    ...(streetWords.length ? streetSuggestions : localityMatches),
    ...(streetWords.length ? localityMatches : streetSuggestions),
  ]).slice(0, 18);
}

function findSelectedLocality(query: string) {
  return localityPresets
    .map((locality) => {
      const matchedAliases = locality.aliases
        .map((alias) => normalizeAddress(alias))
        .filter((alias) => query.includes(alias));
      const score = matchedAliases.length
        ? Math.max(...matchedAliases.map((alias) => alias.length + alias.split(/\s+/).length * 10))
        : 0;

      return { locality, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.locality.label.length - left.locality.label.length)[0]?.locality;
}

function matchesLocality(locality: LocalityPreset, query: string) {
  const normalizedLabel = normalizeAddress(locality.label);
  return (
    normalizedLabel.includes(query) ||
    locality.aliases.some((alias) => normalizeAddress(alias).includes(query) || query.includes(normalizeAddress(alias)))
  );
}

function getStreetWords(query: string, locality: LocalityPreset) {
  const localityNoiseWords = getLocalityNoiseWords(locality);
  const withoutRegion = query
    .replace(/\bкраснодарский\b/g, ' ')
    .replace(/\bкрай\b/g, ' ')
    .replace(/\bроссия\b/g, ' ');
  const withoutAliases = locality.aliases.reduce(
    (result, alias) => result.replace(new RegExp(`\\b${escapeRegExp(normalizeAddress(alias))}\\b`, 'g'), ' '),
    withoutRegion,
  );
  const localityWords = normalizeAddress(locality.label)
    .replace(/\b(краснодарский|край|россия|г|город|ст|станица|с|село|п|поселок|посёлок)\b/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const withoutLocality = localityWords.reduce(
    (result, word) => result.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'), ' '),
    withoutAliases,
  );

  return withoutLocality
    .replace(/\b(г|город|ул|улица|пер|переулок|пр|проспект|ш|шоссе|ст|станица|с|село|п|поселок|посёлок|д|дом|кв|квартира)\b/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !/^\d+$/.test(word))
    .filter((word) => !localityNoiseWords.has(word));
}

function getLocalityNoiseWords(locality: LocalityPreset) {
  const localityAliases = locality.aliases.flatMap((alias) => normalizeAddress(alias).split(/\s+/));
  const localityLabelWords = normalizeAddress(locality.label).split(/\s+/);

  return new Set(
    [
      'краснодарский',
      'край',
      'россия',
      'г',
      'город',
      'ст',
      'станица',
      'с',
      'село',
      'п',
      'поселок',
      'посёлок',
      ...localityLabelWords,
      ...localityAliases,
    ].filter((word) => word.length > 1),
  );
}

function matchesStreet(street: string, words: string[]) {
  const streetSearch = normalizeAddress(street).replace(/\b(ул|улица|пер|переулок|пр|проспект|ш|шоссе)\b/g, ' ');
  return words.every((word) => streetSearch.includes(word));
}

function buildCustomStreetSuggestion(locality: LocalityPreset, streets: string[], streetWords: string[], houseNumber?: string) {
  if (!streetWords.length || streets.some((street) => matchesStreet(street, streetWords))) {
    return null;
  }

  const streetName = streetWords.map(capitalizeWord).join(' ');
  return formatAddressSuggestion(locality.label, `ул. ${streetName}`, houseNumber);
}

function formatAddressSuggestion(localityLabel: string, street: string, houseNumber?: string) {
  return `${localityLabel}, ${street}${houseNumber ? `, ${houseNumber}` : ''}`;
}

function getHouseNumber(rawValue: string) {
  const matches = rawValue.match(/\d+[а-яА-Яa-zA-Z]?(?:[/-]\d+[а-яА-Яa-zA-Z]?)?/g);
  return matches?.[matches.length - 1];
}

function capitalizeWord(word: string) {
  return word ? `${word.charAt(0).toLocaleUpperCase('ru-RU')}${word.slice(1)}` : word;
}

function normalizeAddress(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
