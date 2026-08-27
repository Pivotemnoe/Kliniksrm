import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Drawer, Form, Input, Radio, Select, Space } from 'antd';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useEffect } from 'react';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty } from '../../shared/utils/forms';
import { listRoles } from '../employees/employees.api';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { formatServicePrice, getServiceDefaultPrice, getServicePriceHelp } from '../stock/service-pricing';
import { useVisitProductCatalogPicker, useVisitServiceCatalogPicker } from '../stock/useCatalogPicker';
import { Vaccination, VaccinationMutationInput } from './types';

const vaccinationSchema = z
  .object({
    title: z.string().trim().min(2, 'Введите название').max(200),
    productId: nullableString(),
    quantity: numberText(0.001, 1000000),
    stockQuantity: numberText(0.001, 1000000),
    unitPrice: numberText(0, 1000000000),
    discount: numberText(0, 1000000000),
    serviceId: nullableString(),
    serviceUnitPrice: numberText(0, 1000000000),
    status: nullableString(80),
    vaccinatedAt: nullableDateString(),
    expiresAt: nullableDateString(),
    vaccineBatch: nullableString(120),
    vaccineSeries: nullableString(120),
    vaccineExpiresAt: nullableDateString(),
    smsReminder: z.boolean(),
    ownerReminderEnabled: z.boolean(),
    notes: nullableString(1000),
    createRevaccinationTask: z.boolean(),
    revaccinationAssigneeMode: z.enum(['none', 'employee', 'role']),
    revaccinationAssigneeId: nullableString(),
    revaccinationAssigneeRoleCode: nullableString(80),
  })
  .superRefine((values, context) => {
    const taskEnabled = Boolean(values.expiresAt && values.createRevaccinationTask);

    if (!taskEnabled) {
      return;
    }

    if (values.revaccinationAssigneeMode === 'employee' && !values.revaccinationAssigneeId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['revaccinationAssigneeId'],
        message: 'Выберите сотрудника',
      });
    }

    if (values.revaccinationAssigneeMode === 'role' && !values.revaccinationAssigneeRoleCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['revaccinationAssigneeRoleCode'],
        message: 'Выберите роль',
      });
    }
  });

type VaccinationFormValues = z.infer<typeof vaccinationSchema>;
type VaccinationFormInput = z.input<typeof vaccinationSchema>;

type VaccinationFormDrawerProps = {
  open: boolean;
  title: string;
  visitId?: string;
  initialVaccination?: Vaccination | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: VaccinationMutationInput) => void;
};

export function VaccinationFormDrawer({
  open,
  title,
  visitId,
  initialVaccination,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: VaccinationFormDrawerProps) {
  const { control, handleSubmit, reset, setError, setValue } = useForm<VaccinationFormInput, unknown, VaccinationFormValues>({
    resolver: zodResolver(vaccinationSchema),
    defaultValues: getDefaultValues(initialVaccination, visitId),
  });
  const productId = useWatch({ control, name: 'productId' });
  const serviceId = useWatch({ control, name: 'serviceId' });
  const expiresAt = useWatch({ control, name: 'expiresAt' });
  const vaccinatedAt = useWatch({ control, name: 'vaccinatedAt' });
  const createRevaccinationTask = useWatch({ control, name: 'createRevaccinationTask' });
  const revaccinationAssigneeMode = useWatch({ control, name: 'revaccinationAssigneeMode' });
  const showTaskFields = Boolean(expiresAt && createRevaccinationTask);
  const integratedBilling = Boolean(visitId && !initialVaccination);
  const productsQuery = useVisitProductCatalogPicker(open && integratedBilling);
  const servicesQuery = useVisitServiceCatalogPicker(open && integratedBilling);
  const activeProduct = productsQuery.items.find((item) => item.id === productId) ?? initialVaccination?.product ?? null;
  const activeService = servicesQuery.items.find((item) => item.id === serviceId) ?? null;

  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: open,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: open });

  useEffect(() => {
    if (!open || initialVaccination || !vaccinatedAt || expiresAt) {
      return;
    }

    const nextDate = oneYearAfter(vaccinatedAt);
    if (nextDate) {
      setValue('expiresAt', nextDate, { shouldValidate: true });
    }
  }, [expiresAt, initialVaccination, open, setValue, vaccinatedAt]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialVaccination, visitId));
      productsQuery.resetSearch();
      servicesQuery.resetSearch();
    }
  }

  function submit(values: VaccinationFormValues) {
    if (integratedBilling && !values.productId) {
      setError('productId', { message: 'Выберите вакцину из товаров' });
      return;
    }
    const shouldCreateTask = Boolean(values.expiresAt && values.createRevaccinationTask);

    onSubmit({
      title: values.title,
      ...(integratedBilling && visitId && values.productId ? {
        visitId,
        productId: values.productId,
        quantity: values.quantity,
        stockQuantity: values.stockQuantity,
        unitPrice: values.unitPrice,
        discount: values.discount,
        ...(values.serviceId ? { serviceId: values.serviceId, serviceUnitPrice: values.serviceUnitPrice } : {}),
      } : {}),
      status: values.status,
      vaccinatedAt: values.vaccinatedAt,
      expiresAt: values.expiresAt,
      vaccineBatch: values.vaccineBatch,
      vaccineSeries: values.vaccineSeries,
      vaccineExpiresAt: values.vaccineExpiresAt,
      smsReminder: values.smsReminder,
      ownerReminderEnabled: Boolean(values.expiresAt && values.ownerReminderEnabled),
      notes: values.notes,
      createRevaccinationTask: shouldCreateTask,
      revaccinationAssigneeId: shouldCreateTask && values.revaccinationAssigneeMode === 'employee' ? values.revaccinationAssigneeId : null,
      revaccinationAssigneeRoleCode:
        shouldCreateTask && values.revaccinationAssigneeMode === 'role' ? values.revaccinationAssigneeRoleCode : null,
    });
  }

  return (
    <Drawer
      title={title}
      width={680}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
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
        {rolesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(rolesQuery.error)} className="form-alert" /> : null}
        {productsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(productsQuery.error)} className="form-alert" /> : null}
        {servicesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(servicesQuery.error)} className="form-alert" /> : null}
        {integratedBilling ? (
          <>
            <Alert
              type="info"
              showIcon
              className="form-alert"
              message="Вакцина и выбранная услуга добавятся в товары и услуги этого приёма. Складское списание произойдёт после полной оплаты счёта."
            />
            <Controller
              control={control}
              name="productId"
              render={({ field, fieldState }) => (
                <Form.Item label="Вакцина из товаров" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Select
                    {...field}
                    showSearch
                    filterOption={false}
                    loading={productsQuery.isLoading}
                    onSearch={productsQuery.onSearch}
                    notFoundContent={productsQuery.isFetching ? 'Идёт поиск…' : 'Вакцина не найдена во всём каталоге'}
                    options={productsQuery.items.map((product) => ({
                      value: product.id,
                      label: `${product.title} · ${product.writeOffUnit || product.stockUnit || 'шт'}`,
                    }))}
                    placeholder="Начните вводить название вакцины"
                    onChange={(value) => {
                      field.onChange(value);
                      const product = productsQuery.items.find((item) => item.id === value);
                      if (product) {
                        setValue('title', product.title, { shouldValidate: true });
                        setValue('unitPrice', String(product.retailPrice));
                        setValue('quantity', '1');
                        setValue('stockQuantity', '1');
                      }
                    }}
                  />
                </Form.Item>
              )}
            />
            <div className="form-grid two-columns">
              <Controller control={control} name="stockQuantity" render={({ field, fieldState }) => (
                <Form.Item label={`Списать со склада, ${activeProduct?.writeOffUnit || activeProduct?.stockUnit || 'ед.'}`} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input inputMode="decimal" {...field} />
                </Form.Item>
              )} />
              <Controller control={control} name="quantity" render={({ field, fieldState }) => (
                <Form.Item label={`Начислить клиенту, ${activeProduct?.billingUnit || activeProduct?.writeOffUnit || activeProduct?.stockUnit || 'ед.'}`} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input inputMode="decimal" {...field} />
                </Form.Item>
              )} />
              <Controller control={control} name="unitPrice" render={({ field, fieldState }) => (
                <Form.Item label="Цена за начисление" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input inputMode="decimal" {...field} />
                </Form.Item>
              )} />
              <Controller control={control} name="discount" render={({ field, fieldState }) => (
                <Form.Item label="Скидка" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input inputMode="decimal" {...field} />
                </Form.Item>
              )} />
            </div>
            <Controller control={control} name="serviceId" render={({ field }) => (
              <Form.Item label="Услуга вакцинации, если нужна">
                <Select
                  {...field}
                  allowClear
                  showSearch
                  filterOption={false}
                  loading={servicesQuery.isLoading}
                  onSearch={servicesQuery.onSearch}
                  options={servicesQuery.items.map((service) => ({ value: service.id, label: `${service.title} · ${formatServicePrice(service)}` }))}
                  placeholder="Не выбрана"
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    const service = servicesQuery.items.find((item) => item.id === value);
                    setValue('serviceUnitPrice', String(service ? getServiceDefaultPrice(service) : 0));
                  }}
                />
              </Form.Item>
            )} />
            {serviceId ? <Controller control={control} name="serviceUnitPrice" render={({ field, fieldState }) => (
              <Form.Item label="Цена услуги" extra={getServicePriceHelp(activeService)} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )} /> : null}
          </>
        ) : (
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название вакцины" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
        )}
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="vaccinatedAt"
            render={({ field, fieldState }) => (
              <Form.Item label="Дата вакцинации" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="expiresAt"
            render={({ field, fieldState }) => (
              <Form.Item
                label="Дата ревакцинации"
                extra="Для новой вакцинации автоматически предлагается дата через год"
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message}
              >
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label="Статус" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineBatch"
            render={({ field, fieldState }) => (
              <Form.Item label="Номер" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineSeries"
            render={({ field, fieldState }) => (
              <Form.Item label="Серия" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="vaccineExpiresAt"
            render={({ field, fieldState }) => (
              <Form.Item
                label="Срок годности вакцины"
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message}
              >
                <Input type="date" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
        </div>
        <Space direction="vertical" size={12} className="full-width">
          <Controller
            control={control}
            name="ownerReminderEnabled"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                disabled={!expiresAt}
                onChange={(event) => field.onChange(event.target.checked)}
              >
                Напомнить владельцу за 7 дней и за 1 день (личный кабинет и подключённый мессенджер)
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="createRevaccinationTask"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Создать задачу ревакцинации, если указана дата
              </Checkbox>
            )}
          />
        </Space>
        {showTaskFields ? (
          <>
            <Controller
              control={control}
              name="revaccinationAssigneeMode"
              render={({ field }) => (
                <Form.Item label="Исполнитель задачи">
                  <Radio.Group
                    {...field}
                    optionType="button"
                    buttonStyle="solid"
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      setValue('revaccinationAssigneeId', '');
                      setValue('revaccinationAssigneeRoleCode', '');
                      if (event.target.value === 'role') {
                        setValue('revaccinationAssigneeRoleCode', 'doctor');
                      }
                    }}
                    options={[
                      { value: 'none', label: 'Не назначен' },
                      { value: 'employee', label: 'Сотрудник' },
                      { value: 'role', label: 'Роль' },
                    ]}
                  />
                </Form.Item>
              )}
            />
            {revaccinationAssigneeMode === 'employee' ? (
              <Controller
                control={control}
                name="revaccinationAssigneeId"
                render={({ field, fieldState }) => (
                  <Form.Item label="Сотрудник" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Select
                      {...field}
                      allowClear
                      loading={resourcesQuery.isLoading}
                      options={resourcesQuery.data?.employees.map((employee) => ({
                        label: employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName,
                        value: employee.id,
                      }))}
                      placeholder="Выберите сотрудника"
                      onChange={(value) => field.onChange(value ?? '')}
                    />
                  </Form.Item>
                )}
              />
            ) : null}
            {revaccinationAssigneeMode === 'role' ? (
              <Controller
                control={control}
                name="revaccinationAssigneeRoleCode"
                render={({ field, fieldState }) => (
                  <Form.Item label="Роль" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <Select
                      {...field}
                      allowClear
                      loading={rolesQuery.isLoading}
                      options={rolesQuery.data?.map((role) => ({ label: role.title, value: role.code }))}
                      placeholder="Выберите роль"
                      onChange={(value) => field.onChange(value ?? '')}
                    />
                  </Form.Item>
                )}
              />
            ) : null}
          </>
        ) : null}
        <Controller
          control={control}
          name="notes"
          render={({ field, fieldState }) => (
            <Form.Item label="Примечание" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={4} {...field} value={field.value ?? ''} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getDefaultValues(vaccination?: Vaccination | null, visitId?: string): VaccinationFormInput {
  const task = vaccination?.revaccinationTask;
  const integratedBilling = Boolean(visitId && !vaccination);

  return {
    title: vaccination?.title ?? '',
    productId: vaccination?.productId ?? '',
    quantity: '1',
    stockQuantity: '1',
    unitPrice: vaccination?.product?.retailPrice ? String(vaccination.product.retailPrice) : '0',
    discount: '0',
    serviceId: '',
    serviceUnitPrice: '0',
    status: nullToEmpty(vaccination?.status),
    vaccinatedAt: dateToInput(vaccination?.vaccinatedAt) || (integratedBilling ? todayInput() : ''),
    expiresAt: dateToInput(vaccination?.expiresAt),
    vaccineBatch: nullToEmpty(vaccination?.vaccineBatch),
    vaccineSeries: nullToEmpty(vaccination?.vaccineSeries),
    vaccineExpiresAt: dateToInput(vaccination?.vaccineExpiresAt),
    smsReminder: vaccination?.smsReminder ?? false,
    ownerReminderEnabled: vaccination?.ownerReminderEnabled ?? !vaccination,
    notes: nullToEmpty(vaccination?.notes),
    createRevaccinationTask: vaccination ? Boolean(vaccination.expiresAt && task?.status !== 'CANCELLED') : true,
    revaccinationAssigneeMode: task?.assigneeId ? 'employee' : task?.assigneeRoleCode ? 'role' : 'role',
    revaccinationAssigneeId: task?.assigneeId ?? '',
    revaccinationAssigneeRoleCode: task?.assigneeRoleCode ?? 'doctor',
  };
}

function numberText(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((value) => Number(value.replace(',', '.')))
    .refine((value) => Number.isFinite(value) && value >= min && value <= max, `Введите число от ${min} до ${max}`);
}

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function dateToInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function oneYearAfter(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return '';
  }

  const nextDate = new Date(Date.UTC(Number(match[1]) + 1, Number(match[2]) - 1, Number(match[3])));
  return nextDate.toISOString().slice(0, 10);
}

function nullableString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? null : value));
}

function nullableDateString() {
  return z
    .string()
    .trim()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Укажите корректную дату')
    .transform((value) => (value === '' ? null : value));
}
