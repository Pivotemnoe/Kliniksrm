import { Alert, Form, Input, Select, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { formatAnimalAge, normalizeAnimalBirthDateInput } from '../../shared/utils/animalBirthDate';
import { AnimalCatalogFields } from './AnimalCatalogFields';
import { buildRegistrationAnimalEdit, registrationAnimalValues, type RegistrationAnimalEdit, type RegistrationAnimalValues } from './registrationAnimal';
import type { Animal } from './types';
import { lastVisitText } from '../owners/RegistrationLastVisit';

// Mount with key=animal.id. Refetching the list must not overwrite unfinished edits.
export function RegistrationAnimalFields({ animal, onChange }: { animal: Animal; onChange: (edit: RegistrationAnimalEdit) => void }) {
  const [initial] = useState(animal);
  const { control, setValue } = useForm<RegistrationAnimalValues>({ defaultValues: registrationAnimalValues(initial) });
  const [nickname, species, breed, sex, birthDate] = useWatch({ control, name: ['nickname', 'species', 'breed', 'sex', 'birthDate'] });
  const { data: auth } = useCurrentEmployee();
  const canEdit = hasPermission(auth?.employee, 'animals.manage');
  const missing = [!species && 'вид', !breed && 'порода', sex === 'UNKNOWN' && 'пол', !birthDate && 'дата/год рождения'].filter(Boolean);
  const edit = buildRegistrationAnimalEdit(initial, { nickname, species, breed, sex, birthDate });
  useEffect(() => {
    onChange(buildRegistrationAnimalEdit(initial, { nickname, species, breed, sex, birthDate }));
  }, [initial, nickname, species, breed, sex, birthDate, onChange]);
  return <Form component={false} layout="vertical" disabled={!canEdit}>
    <Typography.Title level={5}>Данные пациента</Typography.Title>
    <Typography.Paragraph><Typography.Text strong>Последний приём пациента: </Typography.Text>{lastVisitText(animal.lastVisitAt)}</Typography.Paragraph>
    {missing.length ? <Alert className="form-alert" type="warning" showIcon message={`Не указаны: ${missing.join(', ')}. Уточните у владельца, если данные известны.`} /> : null}
    {!canEdit ? <Typography.Paragraph type="secondary">Для изменения данных нужны права редактирования пациентов.</Typography.Paragraph> : null}
    <div className="form-grid two-columns">
      <Controller control={control} name="nickname" render={({ field }) => <Form.Item label="Кличка"><Input {...field} maxLength={120} /></Form.Item>} />
      <AnimalCatalogFields control={control} setValue={setValue} />
      <Controller control={control} name="sex" render={({ field }) => <Form.Item label="Пол"><Select {...field} options={[{ value: 'UNKNOWN', label: 'Не указан' }, { value: 'MALE', label: 'Самец' }, { value: 'FEMALE', label: 'Самка' }]} /></Form.Item>} />
      <Controller control={control} name="birthDate" render={({ field }) => <Form.Item label="Дата / год рождения" extra="Можно указать только год или месяц и год."><Input {...field} placeholder="ГГГГ, ММ.ГГГГ или ДД.ММ.ГГГГ" /></Form.Item>} />
      <Form.Item label="Возраст"><Typography.Text>{formatAnimalAge(normalizeAnimalBirthDateInput(birthDate))}</Typography.Text></Form.Item>
    </div>
    {edit.error ? <Alert className="form-alert" type="error" message={edit.error} /> : null}
  </Form>;
}
