import { formatAnimalBirthDateInput, isAnimalBirthDateInputValid, normalizeAnimalBirthDateInput } from '../../shared/utils/animalBirthDate';
import { updateAnimal } from './animals.api';
import { queryClient } from '../../app/queryClient';
import type { Animal, AnimalMutationInput, AnimalSex } from './types';

export type RegistrationAnimalValues = { nickname: string; species: string; breed: string; sex: AnimalSex; birthDate: string };
export type RegistrationAnimalEdit = { animalId: string; ownerId: string; changes: Partial<AnimalMutationInput>; error?: string };

export function registrationAnimalValues(animal: Animal): RegistrationAnimalValues {
  return { nickname: animal.nickname, species: animal.species ?? '', breed: animal.breed ?? '', sex: animal.sex ?? 'UNKNOWN', birthDate: formatAnimalBirthDateInput(animal.birthDate) };
}

export function buildRegistrationAnimalEdit(animal: Animal, values: RegistrationAnimalValues): RegistrationAnimalEdit {
  const initial = registrationAnimalValues(animal);
  const changes: Partial<AnimalMutationInput> = {};
  let error: string | undefined;
  for (const key of ['nickname', 'species', 'breed'] as const) {
    const value = values[key].trim();
    if (value !== initial[key].trim()) {
      if (!value) error = 'Не удаляйте заполненные данные пациента. Укажите новое значение.';
      else if (value.length > (key === 'species' ? 80 : 120)) error = 'Слишком длинное значение в данных пациента.';
      else changes[key] = value;
    }
  }
  if (values.sex !== initial.sex) changes.sex = values.sex;
  if (values.birthDate.trim() !== initial.birthDate) {
    if (!values.birthDate.trim() || !isAnimalBirthDateInputValid(values.birthDate)) {
      error = 'Укажите дату рождения: ГГГГ, ММ.ГГГГ или ДД.ММ.ГГГГ.';
    } else {
      const date = normalizeAnimalBirthDateInput(values.birthDate)!;
      if (date > new Date().toISOString().slice(0, 10)) error = 'Дата рождения не может быть в будущем.';
      else if (date !== animal.birthDate?.slice(0, 10)) changes.birthDate = date;
    }
  }
  return { animalId: animal.id, ownerId: animal.ownerId, changes, error };
}

export async function saveRegistrationAnimalEdit(edit: RegistrationAnimalEdit | undefined, animalId?: string, ownerId?: string) {
  if (!edit) return;
  if (edit.animalId !== animalId || edit.ownerId !== ownerId) throw new Error('Пациент изменился. Выберите его заново.');
  if (edit.error) throw new Error(edit.error);
  if (Object.keys(edit.changes).length) {
    await updateAnimal(edit.animalId, edit.changes);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['animals'] }),
      queryClient.invalidateQueries({ queryKey: ['owners', edit.ownerId] }),
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    ]);
  }
}
