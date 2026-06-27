import { Tag } from 'antd';

export const animalStatusOptions = [
  { value: 'Живой', label: 'Живой', color: 'green' },
  { value: 'Наблюдение', label: 'Наблюдение', color: 'gold' },
  { value: 'Умер', label: 'Умер', color: 'red' },
  { value: 'Эвтаназия', label: 'Эвтаназия', color: 'red' },
  { value: 'Пропал', label: 'Пропал', color: 'orange' },
  { value: 'Выбыл', label: 'Выбыл', color: 'default' },
];

const legacyStatusMap: Record<string, string> = {
  active: 'Живой',
  'под наблюдением': 'Наблюдение',
  'хронический пациент': 'Наблюдение',
  активен: 'Живой',
  активный: 'Живой',
  архив: 'Выбыл',
};

const statusByValue = new Map<string, (typeof animalStatusOptions)[number]>(animalStatusOptions.map((option) => [option.value, option]));

export function normalizeAnimalStatusInput(status?: string | null) {
  const trimmed = status?.trim() ?? '';

  if (!trimmed) {
    return '';
  }

  return legacyStatusMap[getStatusKey(trimmed)] ?? trimmed;
}

export function getAnimalStatusLabel(status?: string | null) {
  return normalizeAnimalStatusInput(status) || 'Не указано';
}

export function getAnimalStatusColor(status?: string | null) {
  const normalized = normalizeAnimalStatusInput(status);
  return statusByValue.get(normalized)?.color ?? (normalized ? 'blue' : 'default');
}

export function AnimalStatusTag({ status }: { status?: string | null }) {
  const normalized = normalizeAnimalStatusInput(status);
  return <Tag color={getAnimalStatusColor(normalized)}>{normalized || 'Не указано'}</Tag>;
}

function getStatusKey(status: string) {
  return status.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
