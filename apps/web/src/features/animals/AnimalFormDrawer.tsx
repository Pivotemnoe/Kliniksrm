import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Checkbox, Drawer, Form, Input, Select, Space } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { formatAnimalBirthDateInput, normalizeAnimalBirthDateInput } from '../../shared/utils/animalBirthDate';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { AnimalCatalogFields } from './AnimalCatalogFields';
import { Animal, AnimalMutationInput, AnimalSex } from './types';

const animalSchema = z.object({
  nickname: z.string().trim().min(1, 'Введите кличку').max(200),
  species: z.string().trim().min(1, 'Выберите вид').max(120),
  breed: z.string().trim().min(1, 'Выберите породу').max(200),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  birthDate: optionalString(),
  color: optionalString(120),
  microchip: optionalString(120),
  mark: optionalString(120),
  status: optionalString(120),
  comment: optionalString(1000),
  isSterilized: z.boolean(),
  isFavorite: z.boolean(),
});

type AnimalFormValues = z.infer<typeof animalSchema>;
type AnimalFormInput = z.input<typeof animalSchema>;

type AnimalFormDrawerProps = {
  open: boolean;
  title: string;
  initialAnimal?: Animal | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: AnimalMutationInput) => void;
};

export function AnimalFormDrawer({
  open,
  title,
  initialAnimal,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: AnimalFormDrawerProps) {
  const { control, handleSubmit, reset, setValue } = useForm<AnimalFormInput, unknown, AnimalFormValues>({
    resolver: zodResolver(animalSchema),
    defaultValues: getDefaultValues(initialAnimal),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialAnimal));
    }
  }

  return (
    <Drawer
      title={title}
      width={560}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit((values) => onSubmit(normalizeAnimalFormValues(values)))}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="nickname"
          render={({ field, fieldState }) => (
            <Form.Item label="Кличка" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <AnimalCatalogFields control={control} setValue={setValue} />
          <Controller
            control={control}
            name="sex"
            render={({ field, fieldState }) => (
              <Form.Item label="Пол" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select<AnimalSex>
                  {...field}
                  options={[
                    { value: 'UNKNOWN', label: 'Не указан' },
                    { value: 'MALE', label: 'Самец' },
                    { value: 'FEMALE', label: 'Самка' },
                  ]}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="birthDate"
            render={({ field, fieldState }) => (
              <Form.Item
                label="Дата рождения"
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message ?? 'Можно ввести только год, например 2020'}
              >
                <Input placeholder="ГГГГ или ДД.ММ.ГГГГ" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="color"
            render={({ field, fieldState }) => (
              <Form.Item label="Окрас" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="microchip"
            render={({ field, fieldState }) => (
              <Form.Item label="Микрочип" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="mark"
            render={({ field, fieldState }) => (
              <Form.Item label="Клеймо" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label="Статус" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} />
              </Form.Item>
            )}
          />
        </div>
        <Space size={20} className="checkbox-row">
          <Controller
            control={control}
            name="isSterilized"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Стерилизован
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="isFavorite"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Избранный
              </Checkbox>
            )}
          />
        </Space>
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState }) => (
            <Form.Item label="Комментарий" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={4} {...field} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getDefaultValues(animal?: Animal | null): AnimalFormInput {
  return {
    nickname: animal?.nickname ?? '',
    species: nullToEmpty(animal?.species),
    breed: nullToEmpty(animal?.breed),
    sex: animal?.sex ?? 'UNKNOWN',
    birthDate: formatAnimalBirthDateInput(animal?.birthDate),
    color: nullToEmpty(animal?.color),
    microchip: nullToEmpty(animal?.microchip),
    mark: nullToEmpty(animal?.mark),
    status: nullToEmpty(animal?.status),
    comment: nullToEmpty(animal?.comment),
    isSterilized: animal?.isSterilized ?? false,
    isFavorite: animal?.isFavorite ?? false,
  };
}

function normalizeAnimalFormValues(values: AnimalFormValues): AnimalMutationInput {
  return {
    ...values,
    birthDate: normalizeAnimalBirthDateInput(values.birthDate),
  };
}
