import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Radio, Select, Space } from 'antd';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { fromDateTimeText, toDateTimeText } from '../../shared/utils/date';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { AnimalCatalogFields } from '../animals/AnimalCatalogFields';
import { AnimalMutationInput, AnimalSex } from '../animals/types';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { OwnerMutationInput } from '../owners/types';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { Appointment, AppointmentMutationInput } from './types';

const appointmentSchema = z
  .object({
    clientMode: z.enum(['existing', 'new']),
    officeId: optionalString(),
    ownerId: optionalString(),
    animalId: optionalString(),
    ownerFullName: optionalString(200),
    ownerPhone: optionalString(32),
    animalNickname: optionalString(120),
    animalSpecies: optionalString(80),
    animalBreed: optionalString(120),
    animalSex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
    employeeId: optionalString(),
    roomId: optionalString(),
    startsAt: z
      .string()
      .trim()
      .min(1, 'Укажите дату и время')
      .refine((value) => Boolean(fromDateTimeText(value)), 'Формат: 2026-05-29 10:15'),
    endsAt: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(z.string().refine((value) => Boolean(fromDateTimeText(value)), 'Формат: 2026-05-29 10:45').optional()),
    comment: optionalString(1000),
  })
  .superRefine((values, context) => {
    if (values.clientMode === 'existing') {
      if (!values.ownerId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'Выберите владельца' });
      }

      if (!values.animalId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalId'], message: 'Выберите пациента' });
      }
    }

    if (values.clientMode === 'new') {
      if (!values.ownerFullName || values.ownerFullName.length < 2) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerFullName'], message: 'Укажите ФИО владельца' });
      }

      if (!values.animalNickname) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalNickname'], message: 'Укажите кличку пациента' });
      }

      if (!values.animalSpecies) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalSpecies'], message: 'Выберите вид' });
      }

      if (!values.animalBreed) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalBreed'], message: 'Выберите породу' });
      }
    }
  });

type AppointmentFormValues = z.infer<typeof appointmentSchema>;
type AppointmentFormInput = z.input<typeof appointmentSchema>;

export type AppointmentFormSubmit = {
  appointment: AppointmentMutationInput & { startsAt: string };
  newOwner?: OwnerMutationInput;
  newAnimal?: AnimalMutationInput;
};

type AppointmentFormDrawerProps = {
  open: boolean;
  title: string;
  initialAppointment?: Appointment | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: AppointmentFormSubmit) => void;
};

export function AppointmentFormDrawer({
  open,
  title,
  initialAppointment,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: AppointmentFormDrawerProps) {
  const { control, handleSubmit, reset, setValue } = useForm<AppointmentFormInput, unknown, AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: getDefaultValues(initialAppointment),
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const clientMode = useWatch({ control, name: 'clientMode' });
  const ownerId = useWatch({ control, name: 'ownerId' });
  const officeId = useWatch({ control, name: 'officeId' });
  const canCreateCards = !initialAppointment;
  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: open,
  });
  const ownersQuery = useQuery({
    queryKey: ['owners', { search: ownerSearch, limit: 20, offset: 0 }],
    queryFn: () => listOwners({ search: ownerSearch, limit: 20, offset: 0 }),
    enabled: open && clientMode === 'existing',
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId!),
    enabled: open && clientMode === 'existing' && Boolean(ownerId),
  });
  const rooms = resourcesQuery.data?.rooms.filter((room) => !officeId || room.officeId === officeId) ?? [];
  const ownerOptions = [
    ...(initialAppointment?.owner ? [{ label: initialAppointment.owner.fullName, value: initialAppointment.owner.id }] : []),
    ...(ownersQuery.data?.items.map((owner) => ({
      label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
      value: owner.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const animalOptions = [
    ...(initialAppointment?.animal ? [{ label: initialAppointment.animal.nickname, value: initialAppointment.animal.id }] : []),
    ...(animalsQuery.data?.map((animal) => ({
      label: [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', '),
      value: animal.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialAppointment));
      setOwnerSearch('');
    }
  }

  function submit(values: AppointmentFormValues) {
    const appointment = {
      officeId: values.officeId,
      ownerId: values.clientMode === 'existing' ? values.ownerId : undefined,
      animalId: values.clientMode === 'existing' ? values.animalId : undefined,
      employeeId: values.employeeId,
      roomId: values.roomId,
      startsAt: fromDateTimeText(values.startsAt)!,
      endsAt: fromDateTimeText(values.endsAt),
      comment: values.comment,
    };

    if (values.clientMode === 'new') {
      onSubmit({
        appointment,
        newOwner: {
          fullName: values.ownerFullName!,
          phone: values.ownerPhone,
          comment: 'Создано из записи на приём',
        },
        newAnimal: {
          nickname: values.animalNickname!,
          species: values.animalSpecies!,
          breed: values.animalBreed!,
          sex: values.animalSex,
        },
      });
      return;
    }

    onSubmit({ appointment });
  }

  return (
    <Modal
      title={title}
      width={620}
      open={open}
      onCancel={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} className="form-alert" /> : null}
        {canCreateCards ? (
          <Controller
            control={control}
            name="clientMode"
            render={({ field }) => (
              <Form.Item label="Клиент">
                <Radio.Group
                  {...field}
                  optionType="button"
                  buttonStyle="solid"
                  onChange={(event) => {
                    field.onChange(event.target.value);
                    setValue('ownerId', '');
                    setValue('animalId', '');
                    setValue('ownerFullName', '');
                    setValue('ownerPhone', '');
                    setValue('animalNickname', '');
                    setValue('animalSpecies', '');
                    setValue('animalBreed', '');
                  }}
                  options={[
                    { value: 'existing', label: 'Существующий' },
                    { value: 'new', label: 'Новая карточка' },
                  ]}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {clientMode === 'existing' ? (
          <div className="form-grid two-columns">
            <Controller
              control={control}
              name="ownerId"
              render={({ field, fieldState }) => (
                <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Select
                    {...field}
                    showSearch
                    filterOption={false}
                    onSearch={setOwnerSearch}
                    loading={ownersQuery.isLoading}
                    options={ownerOptions}
                    placeholder="Найти владельца"
                    onChange={(value) => {
                      field.onChange(value ?? '');
                      setValue('animalId', '');
                    }}
                  />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="animalId"
              render={({ field, fieldState }) => (
                <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Select
                    {...field}
                    loading={animalsQuery.isLoading}
                    options={animalOptions}
                    disabled={!ownerId}
                    placeholder="Выберите пациента"
                    onChange={(value) => field.onChange(value ?? '')}
                  />
                </Form.Item>
              )}
            />
          </div>
        ) : (
          <div className="form-grid two-columns">
            <Controller
              control={control}
              name="ownerFullName"
              render={({ field, fieldState }) => (
                <Form.Item label="ФИО владельца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="ownerPhone"
              render={({ field, fieldState }) => (
                <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <RussianPhoneInput {...field} />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="animalNickname"
              render={({ field, fieldState }) => (
                <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input placeholder="Кличка пациента" {...field} />
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
          </div>
        )}
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="startsAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Дата и время" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input placeholder="2026-05-29 10:15" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="endsAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Окончание" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input placeholder="2026-05-29 10:45" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="officeId"
            render={({ field }) => (
              <Form.Item label="Филиал">
                <Select
                  {...field}
                  allowClear
                  loading={resourcesQuery.isLoading}
                  options={resourcesQuery.data?.offices.map((office) => ({ label: office.name, value: office.id }))}
                  placeholder="Не выбран"
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    setValue('roomId', '');
                  }}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="roomId"
            render={({ field }) => (
              <Form.Item label="Кабинет">
                <Select
                  {...field}
                  allowClear
                  loading={resourcesQuery.isLoading}
                  options={rooms.map((room) => ({ label: room.name, value: room.id }))}
                  placeholder="Не выбран"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="employeeId"
            render={({ field }) => (
              <Form.Item label="Сотрудник">
                <Select
                  {...field}
                  allowClear
                  loading={resourcesQuery.isLoading}
                  options={resourcesQuery.data?.employees.map((employee) => ({
                    label: employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName,
                    value: employee.id,
                  }))}
                  placeholder="Не выбран"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
        </div>
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
    </Modal>
  );
}

function getDefaultValues(appointment?: Appointment | null): AppointmentFormInput {
  return {
    clientMode: 'existing',
    officeId: nullToEmpty(appointment?.officeId),
    ownerId: appointment?.ownerId ?? '',
    animalId: appointment?.animalId ?? '',
    ownerFullName: '',
    ownerPhone: '',
    animalNickname: '',
    animalSpecies: '',
    animalBreed: '',
    animalSex: 'UNKNOWN',
    employeeId: nullToEmpty(appointment?.employeeId),
    roomId: nullToEmpty(appointment?.roomId),
    startsAt: toDateTimeText(appointment?.startsAt),
    endsAt: toDateTimeText(appointment?.endsAt),
    comment: nullToEmpty(appointment?.comment),
  };
}
