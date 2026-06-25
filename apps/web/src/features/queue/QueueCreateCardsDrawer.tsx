import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Checkbox, Drawer, Form, Input, Select, Space } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { isAnimalBirthDateInputValid, normalizeAnimalBirthDateInput } from '../../shared/utils/animalBirthDate';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { AnimalCatalogFields } from '../animals/AnimalCatalogFields';
import { AnimalMutationInput, AnimalSex } from '../animals/types';
import { OwnerMutationInput } from '../owners/types';
import { QueueEntry } from './types';

const createCardsSchema = z.object({
  ownerName: z.string().trim().min(2, 'Введите ФИО владельца').max(200),
  phone: optionalString(32),
  ownerAddress: z.string().trim().min(2, 'Укажите адрес владельца').max(500),
  animalNickname: z.string().trim().min(1, 'Введите пациента').max(120),
  animalSpecies: z.string().trim().min(1, 'Выберите вид').max(80),
  animalBreed: z.string().trim().min(1, 'Выберите породу').max(120),
  animalSex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  birthDate: optionalString().refine(isAnimalBirthDateInputValid, 'Введите дату: ГГГГ, ММ.ГГГГ или ДД.ММ.ГГГГ'),
  color: optionalString(120),
  microchip: optionalString(120),
  mark: optionalString(120),
  status: optionalString(120),
  comment: optionalString(1000),
  isSterilized: z.boolean(),
});

type CreateCardsValues = z.infer<typeof createCardsSchema>;
type CreateCardsInput = z.input<typeof createCardsSchema>;

type QueueCreateCardsDrawerProps = {
  open: boolean;
  queueEntry?: QueueEntry | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  canOpenVisit?: boolean;
  onClose: () => void;
  onSubmit: (values: { owner: OwnerMutationInput; animal: AnimalMutationInput }, afterCreate?: 'visit') => void;
};

export function QueueCreateCardsDrawer({
  open,
  queueEntry,
  submitError,
  isSubmitting,
  canOpenVisit,
  onClose,
  onSubmit,
}: QueueCreateCardsDrawerProps) {
  const { control, handleSubmit, reset, setValue } = useForm<CreateCardsInput, unknown, CreateCardsValues>({
    resolver: zodResolver(createCardsSchema),
    defaultValues: getDefaultValues(queueEntry),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(queueEntry));
    }
  }

  function submit(values: CreateCardsValues, afterCreate?: 'visit') {
    onSubmit({
      owner: {
        fullName: values.ownerName,
        phone: values.phone,
        address: values.ownerAddress,
        source: 'Очередь',
      },
      animal: {
        nickname: values.animalNickname,
        species: values.animalSpecies,
        breed: values.animalBreed,
        sex: values.animalSex,
        birthDate: normalizeAnimalBirthDateInput(values.birthDate),
        color: values.color,
        microchip: values.microchip,
        mark: values.mark,
        status: values.status,
        comment: values.comment,
        isSterilized: values.isSterilized,
      },
    }, afterCreate);
  }

  return (
    <Drawer
      title="Завести карточки из очереди"
      width={560}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button loading={isSubmitting} onClick={handleSubmit((values) => submit(values))}>
            Создать карточки
          </Button>
          {canOpenVisit ? (
            <Button type="primary" loading={isSubmitting} onClick={handleSubmit((values) => submit(values, 'visit'))}>
              Создать и открыть приём
            </Button>
          ) : null}
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="ownerName"
          render={({ field, fieldState }) => (
            <Form.Item label="ФИО владельца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <RussianPhoneInput {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="ownerAddress"
          render={({ field, fieldState }) => (
            <Form.Item label="Адрес владельца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <AddressAutocomplete value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="animalNickname"
            render={({ field, fieldState }) => (
              <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input placeholder="Кличка или описание животного" {...field} />
              </Form.Item>
            )}
          />
          <AnimalCatalogFields control={control} setValue={setValue} speciesName="animalSpecies" breedName="animalBreed" />
          <Controller
            control={control}
            name="animalSex"
            render={({ field }) => (
              <Form.Item label="Пол">
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
                help={fieldState.error?.message ?? 'Можно указать год, месяц и год или полную дату'}
              >
                <Input placeholder="ГГГГ, ММ.ГГГГ или ДД.ММ.ГГГГ" {...field} />
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
              <Form.Item label="Статус пациента" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input placeholder="Активен, наблюдение, архив..." {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="isSterilized"
            render={({ field }) => (
              <Form.Item label="Стерилизация / кастрация">
                <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                  Стерилизован / кастрирован
                </Checkbox>
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState }) => (
            <Form.Item label="Комментарий по пациенту" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={3} {...field} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getDefaultValues(queueEntry?: QueueEntry | null): CreateCardsInput {
  return {
    ownerName: queueEntry?.ownerName ?? '',
    phone: nullToEmpty(queueEntry?.phone),
    ownerAddress: queueEntry?.ownerAddress ?? '',
    animalNickname: queueEntry?.animalNickname ?? '',
    animalSpecies: nullToEmpty(queueEntry?.animalSpecies),
    animalBreed: nullToEmpty(queueEntry?.animalBreed),
    animalSex: queueEntry?.animalSex ?? 'UNKNOWN',
    birthDate: '',
    color: '',
    microchip: '',
    mark: '',
    status: '',
    comment: '',
    isSterilized: false,
  };
}
