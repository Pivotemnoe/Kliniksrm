import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Steps, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { isAnimalBirthDateInputValid, normalizeAnimalBirthDateInput } from '../../shared/utils/animalBirthDate';
import { AnimalCatalogFields } from '../animals/AnimalCatalogFields';
import { AnimalMutationInput, AnimalSex } from '../animals/types';
import { Owner, OwnerMutationInput } from '../owners/types';
import { QueueEntry, QueueMutationInput, QueueUrgency, queueUrgencyLabels } from './types';

const queueSchema = z
  .object({
    clientMode: z.enum(['existing', 'free']),
    officeId: optionalString(),
    ownerId: optionalString(),
    animalId: optionalString(),
    employeeId: optionalString(),
    roomId: optionalString(),
    ownerName: optionalString(200),
    phone: optionalString(32),
    ownerAddress: optionalString(500),
    animalNickname: optionalString(120),
    animalSpecies: optionalString(80),
    animalBreed: optionalString(120),
    animalSex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
    birthDate: optionalString().refine(isAnimalBirthDateInputValid, 'Введите дату: ГГГГ, ММ.ГГГГ или ДД.ММ.ГГГГ'),
    color: optionalString(120),
    microchip: optionalString(120),
    mark: optionalString(120),
    animalStatus: optionalString(120),
    animalComment: optionalString(1000),
    isSterilized: z.boolean(),
    isFavorite: z.boolean(),
    urgency: z.enum(['PLANNED', 'URGENT']),
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

    if (values.clientMode === 'free' && !values.ownerName && !values.phone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownerName'],
        message: 'Укажите ФИО владельца или телефон',
      });
    }

    if (values.clientMode === 'free' && !values.ownerAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownerAddress'],
        message: 'Укажите адрес владельца',
      });
    }

    if (values.clientMode === 'free' && !values.animalNickname) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['animalNickname'],
        message: 'Укажите кличку или описание животного',
      });
    }

    if (values.clientMode === 'free' && !values.animalSpecies) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalSpecies'], message: 'Выберите вид' });
    }

    if (values.clientMode === 'free' && !values.animalBreed) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['animalBreed'], message: 'Выберите породу' });
    }
  });

type QueueFormValues = z.infer<typeof queueSchema>;
type QueueFormInput = z.input<typeof queueSchema>;

export type QueueFormSubmitInput = QueueMutationInput & {
  createCards?: {
    owner: OwnerMutationInput;
    animal: AnimalMutationInput;
  };
};

type QueueFormDrawerProps = {
  open: boolean;
  title: string;
  initialQueue?: QueueEntry | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: QueueFormSubmitInput) => void;
};

export function QueueFormDrawer({
  open,
  title,
  initialQueue,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: QueueFormDrawerProps) {
  const navigate = useNavigate();
  const { control, handleSubmit, reset, setValue } = useForm<QueueFormInput, unknown, QueueFormValues>({
    resolver: zodResolver(queueSchema),
    defaultValues: getDefaultValues(initialQueue),
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [step, setStep] = useState<'intake' | 'cards'>('intake');
  const clientMode = useWatch({ control, name: 'clientMode' });
  const ownerId = useWatch({ control, name: 'ownerId' });
  const officeId = useWatch({ control, name: 'officeId' });
  const primaryOwnerName = useWatch({ control, name: 'ownerName' });
  const primaryPhone = useWatch({ control, name: 'phone' });
  const primaryAnimalNickname = useWatch({ control, name: 'animalNickname' });
  const isPrimaryCreate = !initialQueue && clientMode === 'free';
  const isCardsStep = isPrimaryCreate && step === 'cards';
  const duplicateSearch = getDuplicateSearch(primaryPhone, primaryOwnerName);

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
  const duplicateOwnersQuery = useQuery({
    queryKey: ['owners', 'queue-intake-duplicates', duplicateSearch],
    queryFn: () => listOwners({ search: duplicateSearch, limit: 10, offset: 0 }),
    enabled: open && isPrimaryCreate && !isCardsStep && Boolean(duplicateSearch),
  });

  const rooms = resourcesQuery.data?.rooms.filter((room) => !officeId || room.officeId === officeId) ?? [];
  const ownerOptions = [
    ...(initialQueue?.owner ? [{ label: initialQueue.owner.fullName, value: initialQueue.owner.id }] : []),
    ...(ownersQuery.data?.items.map((owner) => ({
      label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
      value: owner.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const animalOptions = [
    ...(initialQueue?.animal ? [{ label: initialQueue.animal.nickname, value: initialQueue.animal.id }] : []),
    ...(animalsQuery.data?.map((animal) => ({
      label: [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', '),
      value: animal.id,
    })) ?? []),
  ].filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index);
  const duplicateInfo = useMemo(
    () => getDuplicateInfo(duplicateOwnersQuery.data?.items ?? [], primaryOwnerName, primaryPhone, primaryAnimalNickname),
    [duplicateOwnersQuery.data?.items, primaryAnimalNickname, primaryOwnerName, primaryPhone],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialQueue));
      setOwnerSearch('');
      setStep('intake');
    }
  }

  function submit(values: QueueFormValues) {
    if (isPrimaryCreate && step === 'intake' && duplicateInfo.blocked) {
      return;
    }

    if (isPrimaryCreate && step === 'intake') {
      setStep('cards');
      return;
    }

    onSubmit(toQueueInput(values, { createCards: isPrimaryCreate }));
  }

  function handleBackOrClose() {
    if (isCardsStep) {
      setStep('intake');
      return;
    }

    onClose();
  }

  function openDuplicateOwner(ownerId: string) {
    onClose();
    navigate(`/owners/${ownerId}`);
  }

  return (
    <Modal
      title={title}
      width={isCardsStep ? 760 : 620}
      open={open}
      onCancel={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleBackOrClose}>{isCardsStep ? 'Назад' : 'Отмена'}</Button>
          <Button type="primary" loading={isSubmitting} disabled={isPrimaryCreate && !isCardsStep && duplicateInfo.blocked} onClick={handleSubmit(submit)}>
            {getSubmitLabel({ initialQueue, isPrimaryCreate, isCardsStep })}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        {resourcesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(resourcesQuery.error)} className="form-alert" /> : null}
        {isPrimaryCreate ? (
          <Steps
            size="small"
            current={isCardsStep ? 1 : 0}
            className="form-alert"
            items={[{ title: 'Очередь' }, { title: 'Карточки' }]}
          />
        ) : null}
        {isCardsStep ? (
          <PrimaryCardsStep control={control} setValue={setValue} />
        ) : (
          <>
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
                      setStep('intake');
                      setValue('ownerId', '');
                      setValue('animalId', '');
                      setValue('ownerName', '');
                      setValue('phone', '');
                      setValue('ownerAddress', '');
                    }}
                    options={[
                      { value: 'existing', label: 'Существующий' },
                      { value: 'free', label: 'Первичный' },
                    ]}
                  />
                </Form.Item>
              )}
            />
            {clientMode === 'existing' ? (
              <ExistingClientFields
                control={control}
                ownerId={ownerId}
                ownerOptions={ownerOptions}
                animalOptions={animalOptions}
                ownersLoading={ownersQuery.isLoading}
                animalsLoading={animalsQuery.isLoading}
                setOwnerSearch={setOwnerSearch}
                setValue={setValue}
              />
            ) : (
              <>
                <QueueDuplicateAlert duplicateInfo={duplicateInfo} loading={duplicateOwnersQuery.isFetching} onOpenOwner={openDuplicateOwner} />
                <PrimaryIntakeFields control={control} setValue={setValue} />
              </>
            )}
            <QueueDetailsFields
              control={control}
              resourcesLoading={resourcesQuery.isLoading}
              offices={resourcesQuery.data?.offices ?? []}
              rooms={rooms}
              employees={resourcesQuery.data?.employees ?? []}
              setValue={setValue}
            />
          </>
        )}
      </Form>
    </Modal>
  );
}

type QueueDuplicateInfo = {
  blocked: boolean;
  severity: 'warning' | 'error' | null;
  title: string | null;
  description: string | null;
  owner?: Owner;
};

function QueueDuplicateAlert({
  duplicateInfo,
  loading,
  onOpenOwner,
}: {
  duplicateInfo: QueueDuplicateInfo;
  loading: boolean;
  onOpenOwner: (ownerId: string) => void;
}) {
  if (!duplicateInfo.title && !loading) {
    return null;
  }

  if (loading && !duplicateInfo.title) {
    return <Alert type="info" showIcon className="form-alert" message="Проверяем совпадения по владельцам..." />;
  }

  return (
    <Alert
      type={duplicateInfo.severity ?? 'warning'}
      showIcon
      className="form-alert"
      message={duplicateInfo.title}
      description={duplicateInfo.description}
      action={
        duplicateInfo.owner ? (
          <Button size="small" onClick={() => onOpenOwner(duplicateInfo.owner!.id)}>
            Открыть карточку
          </Button>
        ) : null
      }
    />
  );
}

function ExistingClientFields({
  control,
  ownerId,
  ownerOptions,
  animalOptions,
  ownersLoading,
  animalsLoading,
  setOwnerSearch,
  setValue,
}: {
  control: any;
  ownerId?: string;
  ownerOptions: Array<{ label: string; value: string }>;
  animalOptions: Array<{ label: string; value: string }>;
  ownersLoading: boolean;
  animalsLoading: boolean;
  setOwnerSearch: (value: string) => void;
  setValue: any;
}) {
  return (
    <div className="form-grid two-columns">
      <Controller
        control={control}
        name="ownerId"
        render={({ field, fieldState }) => (
          <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <Select
              {...field}
              allowClear
              showSearch
              filterOption={false}
              onSearch={setOwnerSearch}
              loading={ownersLoading}
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
              allowClear
              loading={animalsLoading}
              options={animalOptions}
              disabled={!ownerId}
              placeholder="Выберите пациента"
              onChange={(value) => field.onChange(value ?? '')}
            />
          </Form.Item>
        )}
      />
    </div>
  );
}

function PrimaryIntakeFields({ control, setValue }: { control: any; setValue: any }) {
  return (
    <div className="form-grid two-columns">
      <Controller
        control={control}
        name="ownerName"
        render={({ field, fieldState }) => (
          <Form.Item label="ФИО владельца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <Input {...field} />
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
          <Form.Item
            label="Адрес владельца"
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error?.message}
            className="form-grid-full"
          >
            <AddressAutocomplete value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          </Form.Item>
        )}
      />
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
    </div>
  );
}

function PrimaryCardsStep({ control, setValue }: { control: any; setValue: any }) {
  return (
    <>
      <Typography.Text type="secondary">
        Дозаполните карточки владельца и пациента. После сохранения они будут созданы в базе и сразу добавлены в очередь.
      </Typography.Text>
      <div className="form-grid two-columns queue-card-step">
        <Controller
          control={control}
          name="ownerName"
          render={({ field, fieldState }) => (
            <Form.Item label="ФИО владельца" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
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
            <Form.Item
              label="Адрес владельца"
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message}
              className="form-grid-full"
            >
              <AddressAutocomplete value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="animalNickname"
          render={({ field, fieldState }) => (
            <Form.Item label="Кличка пациента" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
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
          name="animalStatus"
          render={({ field, fieldState }) => (
            <Form.Item label="Статус пациента" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Select
                {...field}
                allowClear
                placeholder="Не выбран"
                options={[
                  { value: 'Активен', label: 'Активен' },
                  { value: 'Под наблюдением', label: 'Под наблюдением' },
                  { value: 'Хронический пациент', label: 'Хронический пациент' },
                  { value: 'Архив', label: 'Архив' },
                ]}
                onChange={(value) => field.onChange(value ?? '')}
              />
            </Form.Item>
          )}
        />
        <Form.Item label="Особые отметки">
          <Space direction="vertical" size={8}>
            <Controller
              control={control}
              name="isSterilized"
              render={({ field }) => (
                <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                  Стерилизован / кастрирован
                </Checkbox>
              )}
            />
            <Controller
              control={control}
              name="isFavorite"
              render={({ field }) => (
                <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                  Важный пациент
                </Checkbox>
              )}
            />
          </Space>
        </Form.Item>
        <Controller
          control={control}
          name="animalComment"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Комментарий по пациенту"
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message}
              className="form-grid-full"
            >
              <Input.TextArea rows={3} {...field} />
            </Form.Item>
          )}
        />
      </div>
    </>
  );
}

function QueueDetailsFields({
  control,
  resourcesLoading,
  offices,
  rooms,
  employees,
  setValue,
}: {
  control: any;
  resourcesLoading: boolean;
  offices: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; fullName: string; position?: string | null }>;
  setValue: any;
}) {
  return (
    <>
      <div className="form-grid two-columns">
          <Controller
            control={control}
            name="officeId"
            render={({ field }) => (
              <Form.Item label="Филиал">
                <Select
                  {...field}
                  allowClear
                  loading={resourcesLoading}
                  options={offices.map((office) => ({ label: office.name, value: office.id }))}
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
                  loading={resourcesLoading}
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
                  loading={resourcesLoading}
                  options={employees.map((employee) => ({
                    label: employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName,
                    value: employee.id,
                  }))}
                  placeholder="Не выбран"
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="urgency"
            render={({ field }) => (
              <Form.Item label="Срочность">
                <Select<QueueUrgency>
                  {...field}
                  options={[
                    { value: 'PLANNED', label: queueUrgencyLabels.PLANNED },
                    { value: 'URGENT', label: queueUrgencyLabels.URGENT },
                  ]}
                />
              </Form.Item>
            )}
          />
      </div>
      <Controller
        control={control}
        name="comment"
        render={({ field, fieldState }) => (
          <Form.Item label="Комментарий к очереди" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <Input.TextArea rows={4} {...field} />
          </Form.Item>
        )}
      />
    </>
  );
}

function getDefaultValues(queueEntry?: QueueEntry | null): QueueFormInput {
  return {
    clientMode: !queueEntry || queueEntry.ownerId ? 'existing' : 'free',
    officeId: nullToEmpty(queueEntry?.officeId),
    ownerId: nullToEmpty(queueEntry?.ownerId),
    animalId: nullToEmpty(queueEntry?.animalId),
    employeeId: nullToEmpty(queueEntry?.employeeId),
    roomId: nullToEmpty(queueEntry?.roomId),
    ownerName: nullToEmpty(queueEntry?.ownerName),
    phone: nullToEmpty(queueEntry?.phone),
    ownerAddress: nullToEmpty(queueEntry?.ownerAddress),
    animalNickname: nullToEmpty(queueEntry?.animalNickname),
    animalSpecies: nullToEmpty(queueEntry?.animalSpecies),
    animalBreed: nullToEmpty(queueEntry?.animalBreed),
    animalSex: queueEntry?.animalSex ?? 'UNKNOWN',
    birthDate: '',
    color: '',
    microchip: '',
    mark: '',
    animalStatus: '',
    animalComment: '',
    isSterilized: false,
    isFavorite: false,
    urgency: queueEntry?.urgency ?? 'PLANNED',
    comment: nullToEmpty(queueEntry?.comment),
  };
}

function toQueueInput(values: QueueFormValues, options: { createCards: boolean }): QueueFormSubmitInput {
  const common = {
    officeId: values.officeId,
    employeeId: values.employeeId,
    roomId: values.roomId,
    urgency: values.urgency,
    comment: values.comment,
  };

  if (values.clientMode === 'existing') {
    return {
      ...common,
      ownerId: values.ownerId,
      animalId: values.animalId,
      ownerName: undefined,
      phone: undefined,
      ownerAddress: undefined,
      animalNickname: undefined,
      animalSpecies: undefined,
      animalBreed: undefined,
      animalSex: undefined,
    };
  }

  if (options.createCards) {
    return {
      ...common,
      createCards: {
        owner: {
          fullName: values.ownerName ?? '',
          phone: values.phone,
          address: values.ownerAddress,
          source: 'Очередь',
        },
        animal: {
          nickname: values.animalNickname ?? '',
          species: values.animalSpecies ?? '',
          breed: values.animalBreed ?? '',
          sex: values.animalSex,
          birthDate: normalizeAnimalBirthDateInput(values.birthDate),
          color: values.color,
          microchip: values.microchip,
          mark: values.mark,
          status: values.animalStatus,
          comment: values.animalComment,
          isSterilized: values.isSterilized,
          isFavorite: values.isFavorite,
        },
      },
    };
  }

  return {
    ...common,
    ownerId: undefined,
    animalId: undefined,
    ownerName: values.ownerName,
    phone: values.phone,
    ownerAddress: values.ownerAddress,
    animalNickname: values.animalNickname,
    animalSpecies: values.animalSpecies,
    animalBreed: values.animalBreed,
    animalSex: values.animalSex,
  };
}

function getSubmitLabel({
  initialQueue,
  isPrimaryCreate,
  isCardsStep,
}: {
  initialQueue?: QueueEntry | null;
  isPrimaryCreate: boolean;
  isCardsStep: boolean;
}) {
  if (initialQueue) {
    return 'Сохранить';
  }

  if (isPrimaryCreate && !isCardsStep) {
    return 'Продолжить';
  }

  if (isPrimaryCreate && isCardsStep) {
    return 'Создать карточки и добавить в очередь';
  }

  return 'Добавить в очередь';
}

function getDuplicateSearch(phone?: string, ownerName?: string) {
  const phoneKey = getPhoneKey(phone);
  if (phoneKey.length >= 6) {
    return phone ?? phoneKey;
  }

  const normalizedName = normalizePersonName(ownerName);
  return normalizedName.length >= 3 ? ownerName?.trim() : '';
}

function getDuplicateInfo(owners: Owner[], ownerName?: string, phone?: string, animalNickname?: string): QueueDuplicateInfo {
  const phoneKey = getPhoneKey(phone);
  const ownerNameKey = normalizePersonName(ownerName);
  const animalNameKey = normalizePersonName(animalNickname);
  const phoneOwner = phoneKey.length === 11 ? owners.find((owner) => ownerHasPhone(owner, phoneKey)) : undefined;

  if (phoneOwner) {
    return {
      blocked: true,
      severity: 'error',
      title: 'Владелец с таким телефоном уже есть',
      description: `${phoneOwner.fullName}${phoneOwner.phone ? `, ${phoneOwner.phone}` : ''}. Используйте существующую карточку, чтобы не создать дубль.`,
      owner: phoneOwner,
    };
  }

  const nameOwners = ownerNameKey.length >= 3 ? owners.filter((owner) => normalizePersonName(owner.fullName) === ownerNameKey) : [];
  const animalOwner =
    animalNameKey.length >= 2
      ? nameOwners.find((owner) => owner.animals?.some((animal) => normalizePersonName(animal.nickname) === animalNameKey))
      : undefined;

  if (animalOwner) {
    return {
      blocked: true,
      severity: 'error',
      title: 'Похожая карточка владельца и пациента уже есть',
      description: `${animalOwner.fullName}, пациент ${animalNickname}. Проверьте существующую карточку перед созданием новой.`,
      owner: animalOwner,
    };
  }

  if (nameOwners.length) {
    const firstOwner = nameOwners[0];
    return {
      blocked: false,
      severity: 'warning',
      title: 'Найден владелец с таким ФИО',
      description: `${firstOwner.fullName}${firstOwner.phone ? `, ${firstOwner.phone}` : ''}. Если это тот же клиент, лучше выбрать существующую карточку.`,
      owner: firstOwner,
    };
  }

  return { blocked: false, severity: null, title: null, description: null };
}

function ownerHasPhone(owner: Owner, phoneKey: string) {
  return [owner.phone, owner.extraPhone].some((phone) => getPhoneKey(phone) === phoneKey);
}

function getPhoneKey(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}

function normalizePersonName(value?: string | null) {
  return (value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}
