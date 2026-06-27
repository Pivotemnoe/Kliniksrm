import { Tag } from 'antd';

export const animalStatusOptions = [
  { value: 'Здоров', label: 'Здоров', color: 'green' },
  { value: 'Улучшение', label: 'Улучшение', color: 'blue' },
  { value: 'Ухудшение', label: 'Ухудшение', color: 'red' },
  { value: 'Обследование', label: 'Обследование', color: 'gold' },
  { value: 'Погиб', label: 'Погиб', color: 'default' },
  { value: 'Неактивен', label: 'Неактивен', color: 'default' },
];

const legacyStatusMap: Record<string, string> = {
  active: 'Здоров',
  'под наблюдением': 'Обследование',
  'хронический пациент': 'Обследование',
  активен: 'Здоров',
  активный: 'Здоров',
  архив: 'Неактивен',
  живой: 'Здоров',
  наблюдение: 'Обследование',
  умер: 'Погиб',
  эвтаназия: 'Погиб',
  пропал: 'Неактивен',
  выбыл: 'Неактивен',
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
