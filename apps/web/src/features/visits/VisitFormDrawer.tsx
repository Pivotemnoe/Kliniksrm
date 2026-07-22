import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Descriptions, Drawer, Form, Radio, Select, Space, Tag } from 'antd';
import dayjs from 'dayjs';
import { FocusEvent, KeyboardEvent, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { fromDateTimeText, normalizeDateTimeText, toDateTimeText } from '../../shared/utils/date';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { Appointment } from '../appointments/types';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { QueueEntry } from '../queue/types';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { CreateVisitInput, VisitType, visitStatusColors, visitStatusLabels, visitTypeLabels } from './types';

const dateTimePickerFormats = [
  'DD.MM.YYYY HH:mm',
  'D.M.YYYY H:mm',
  'DD.MM.YY HH:mm',
  'DD,MM,YYYY HH:mm',
  'DD MM YYYY HH:mm',
  'DD MM YYYY HH mm',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DDTHH:mm',
  'YYYY.MM.DD HH:mm',
  'YYYY MM DD HH:mm',
];

const visitSchema = z
  .object({
    ownerId: optionalString(),
    animalId: optionalString(),
    employeeId: optionalString(),
    startedAt: z
      .string()
      .trim()
      .min(1, 'Укажите дату и время')
      .refine((value) => Boolean(fromDateTimeText(value)), 'Например: 25.06.2026 10:15'),
    status: z.enum(['DRAFT', 'IN_PROGRESS']),
    visitType: z.enum(['PRIMARY', 'FOLLOW_UP']),
  })
  .superRefine((values, context) => {
    if (!values.ownerId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'Выберите владельца' });
    }

    if (!values.animalId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalId'], message: 'Выберите пациента' });
    }
  });

type VisitFormValues = z.infer<typeof visitSchema>;
type VisitFormInput = z.input<typeof visitSchema>;

type VisitSourceContext =
  | { type: 'appointment'; appointment: Appointment }
  | { type: 'queue'; queueEntry: QueueEntry }
  | null;

type VisitFormDrawerProps = {
  open: boolean;
  sourceContext?: VisitSourceContext;
  initialOwnerId?: string;
  initialAnimalId?: string;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: CreateVisitInput) => void;
};

export function VisitFormDrawer({
  open,
  sourceContext = null,
  initialOwnerId,
  initialAnimalId,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: VisitFormDrawerProps) {
  const { control, handleSubmit, reset, setValue } = useForm<VisitFormInput, unknown, VisitFormValues>({
    resolver: zodResolver(visitSchema),
    defaultValues: getDefaultValues(sourceContext, initialOwnerId, initialAnimalId),
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerId = useWatch({ control, name: 'ownerId' });
  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: open,
  });
  const ownersQuery = useQuery({
    queryKey: ['owners', { search: ownerSearch, limit: 20, offset: 0 }],
    queryFn: () => listOwners({ search: ownerSearch, limit: 20, offset: 0 }),
    enabled: open && !sourceContext,
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId!),
    enabled: open && Boolean(ownerId),
  });

  const sourceOwner = getSourceOwner(sourceContext);
  const sourceAnimal = getSourceAnimal(sourceContext);
  const sourceBlocked = sourceContext?.type === 'queue' && (!sourceContext.queueEntry.ownerId || !sourceContext.queueEntry.animalId);
  const ownerOptions = [
    ...(sourceOwner ? [{ label: sourceOwner.fullName, value: sourceOwner.id }] : []),
    ...(ownersQuery.data?.items.map((owner) => ({
      label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
      value: owner.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const animalOptions = [
    ...(sourceAnimal ? [{ label: sourceAnimal.nickname, value: sourceAnimal.id }] : []),
    ...(animalsQuery.data?.map((animal) => ({
      label: [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', '),
      value: animal.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(sourceContext, initialOwnerId, initialAnimalId));
      setOwnerSearch('');
    }
  }

  function submit(values: VisitFormValues) {
    onSubmit({
      ownerId: values.ownerId,
      animalId: values.animalId,
      employeeId: values.employeeId,
      startedAt: fromDateTimeText(values.startedAt),
      status: values.status,
      visitType: values.visitType,
      ...(sourceContext?.type === 'appointment' ? { appointmentId: sourceContext.appointment.id } : {}),
      ...(sourceContext?.type === 'queue' ? { queueEntryId: sourceContext.queueEntry.id } : {}),
    });
  }

  return (
    <Drawer
      title={sourceContext ? getSourceTitle(sourceContext) : 'Создать приём'}
      width={620}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} disabled={sourceBlocked} onClick={handleSubmit(submit)}>
            {sourceContext ? 'Создать приём' : 'Добавить на приём'}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} className="form-alert" /> : null}
        {sourceBlocked ? (
          <Alert
            type="warning"
            showIcon
            className="form-alert"
            message="Для создания приёма очередь должна быть связана с карточкой владельца и пациента."
          />
        ) : null}
        {sourceContext ? <SourceDescription sourceContext={sourceContext} /> : null}
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="ownerId"
            render={({ field, fieldState }) => (
              <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  disabled={Boolean(sourceContext)}
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
                  disabled={Boolean(sourceContext) || !ownerId}
                  loading={animalsQuery.isLoading}
                  options={animalOptions}
                  placeholder="Выберите пациента"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="startedAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Дата и время" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <DateTimePickerInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="25.06.2026 10:15"
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
                  placeholder="Назначится текущий сотрудник"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="visitType"
            render={({ field }) => (
              <Form.Item label="Прием">
                <Select<VisitType>
                  {...field}
                  options={Object.entries(visitTypeLabels).map(([value, label]) => ({ value: value as VisitType, label }))}
                />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Form.Item label="Начальный статус">
              <Radio.Group
                {...field}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { value: 'IN_PROGRESS', label: visitStatusLabels.IN_PROGRESS },
                  { value: 'DRAFT', label: visitStatusLabels.DRAFT },
                ]}
              />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function DateTimePickerInput({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder: string;
}) {
  const parsedIso = fromDateTimeText(value);

  function commitRawValue(rawValue: string) {
    const normalized = normalizeDateTimeText(rawValue);
    onChange(normalized ?? rawValue.trim());
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const rawValue = getPickerInputValue(event);
    if (rawValue) {
      commitRawValue(rawValue);
    }
    onBlur();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    const rawValue = getPickerInputValue(event);
    if (rawValue) {
      commitRawValue(rawValue);
    }
  }

  return (
    <DatePicker
      showTime={{ format: 'HH:mm' }}
      format={dateTimePickerFormats}
      value={parsedIso ? dayjs(parsedIso) : null}
      allowClear
      preserveInvalidOnBlur
      className="full-width"
      placeholder={placeholder}
      onChange={(nextValue) => onChange(nextValue ? toDateTimeText(nextValue.toDate().toISOString()) : '')}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

function getPickerInputValue(event: FocusEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLInputElement | null;
  if (target && typeof target.value === 'string') {
    return target.value.trim();
  }

  const input = event.currentTarget.querySelector('input');
  return input?.value.trim() ?? '';
}

function SourceDescription({ sourceContext }: { sourceContext: NonNullable<VisitSourceContext> }) {
  if (sourceContext.type === 'appointment') {
    const appointment = sourceContext.appointment;

    return (
      <Descriptions bordered size="small" column={1} className="form-alert">
        <Descriptions.Item label="Источник">Запись на приём</Descriptions.Item>
        <Descriptions.Item label="Клиент">{appointment.owner?.fullName ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Пациент">{appointment.animal?.nickname ?? '—'}</Descriptions.Item>
      </Descriptions>
    );
  }

  const queueEntry = sourceContext.queueEntry;

  return (
    <Descriptions bordered size="small" column={1} className="form-alert">
      <Descriptions.Item label="Источник">Электронная очередь</Descriptions.Item>
      <Descriptions.Item label="Клиент">{queueEntry.owner?.fullName ?? queueEntry.ownerName ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Пациент">{queueEntry.animal?.nickname ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Статус">
        <Tag color={visitStatusColors.DRAFT}>Через очередь</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Прием">
        {queueEntry.visitType ? visitTypeLabels[queueEntry.visitType] : visitTypeLabels.PRIMARY}
      </Descriptions.Item>
    </Descriptions>
  );
}

function getDefaultValues(
  sourceContext: VisitSourceContext,
  initialOwnerId?: string,
  initialAnimalId?: string,
): VisitFormInput {
  const sourceOwner = getSourceOwner(sourceContext);
  const sourceAnimal = getSourceAnimal(sourceContext);

  return {
    ownerId: sourceOwner?.id ?? initialOwnerId ?? '',
    animalId: sourceAnimal?.id ?? initialAnimalId ?? '',
    employeeId: nullToEmpty(getSourceEmployeeId(sourceContext)),
    startedAt: toDateTimeText(new Date().toISOString()),
    status: 'IN_PROGRESS',
    visitType: getSourceVisitType(sourceContext) ?? 'PRIMARY',
  };
}

function getSourceTitle(sourceContext: VisitSourceContext) {
  if (sourceContext?.type === 'appointment') {
    return 'Создать приём из записи';
  }

  if (sourceContext?.type === 'queue') {
    return 'Создать приём из очереди';
  }

  return 'Создать приём';
}

function getSourceOwner(sourceContext: VisitSourceContext) {
  if (sourceContext?.type === 'appointment') {
    return sourceContext.appointment.owner ?? null;
  }

  if (sourceContext?.type === 'queue') {
    return sourceContext.queueEntry.owner ?? null;
  }

  return null;
}

function getSourceAnimal(sourceContext: VisitSourceContext) {
  if (sourceContext?.type === 'appointment') {
    return sourceContext.appointment.animal ?? null;
  }

  if (sourceContext?.type === 'queue') {
    return sourceContext.queueEntry.animal ?? null;
  }

  return null;
}

function getSourceEmployeeId(sourceContext: VisitSourceContext) {
  if (sourceContext?.type === 'appointment') {
    return sourceContext.appointment.employeeId;
  }

  if (sourceContext?.type === 'queue') {
    return sourceContext.queueEntry.employeeId;
  }

  return undefined;
}

function getSourceVisitType(sourceContext: VisitSourceContext) {
  if (sourceContext?.type === 'queue') {
    return sourceContext.queueEntry.visitType;
  }

  return undefined;
}
