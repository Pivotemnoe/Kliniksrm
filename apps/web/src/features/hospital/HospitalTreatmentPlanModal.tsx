import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { getHospitalCatalog } from './hospital.api';
import type { CreateHospitalTreatmentPlanInput, HospitalCatalog, HospitalRecordType } from './types';
import { formatServicePrice, getServiceDefaultPrice, getServicePriceHelp, getServicePriceRange } from '../stock/service-pricing';

type CatalogPlanOption = {
  key: string;
  value: string;
  label: string;
  catalogKind: 'PRODUCT' | 'SERVICE';
  product?: HospitalCatalog['products'][number];
  service?: HospitalCatalog['services'][number];
};

type TreatmentPlanFormValues = {
  title?: string;
  items: Array<{
    recordType: HospitalRecordType;
    title: string;
    value?: string;
    notes?: string;
    catalogKind?: 'PRODUCT' | 'SERVICE';
    productId?: string;
    serviceId?: string;
    quantity?: number;
    stockQuantity?: number;
    unitPrice?: number;
    writeOffUnit?: string;
    billingUnit?: string;
    stockUnit?: string;
    stockRest?: string | number;
    dates: Array<{ at: string }>;
    repeatEvery?: number;
    repeatUnit?: 'HOURS' | 'DAYS';
    repeatCount?: number;
  }>;
};

export function HospitalTreatmentPlanModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: CreateHospitalTreatmentPlanInput) => void;
}) {
  const [form] = Form.useForm<TreatmentPlanFormValues>();
  const { message } = App.useApp();
  const [catalogSearch, setCatalogSearch] = useState('');
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const items = Form.useWatch('items', form) ?? [];
  const catalogQuery = useQuery({
    queryKey: ['hospital', 'catalog', 'treatment-plan', deferredCatalogSearch],
    queryFn: () => getHospitalCatalog(deferredCatalogSearch || undefined),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCatalogSearch('');
    form.setFieldsValue({ title: '', items: [newTreatmentPlanItem()] });
  }, [form, open]);

  const catalogOptions = useMemo(() => {
    const values: CatalogPlanOption[] = [];
    for (const product of catalogQuery.data?.products ?? []) {
      values.push({
        key: `PRODUCT:${product.id}`,
        value: product.title,
        label: `${product.title} · товар · остаток ${product.stockRest} ${product.stockUnit ?? ''}`,
        catalogKind: 'PRODUCT',
        product,
      });
    }
    for (const service of catalogQuery.data?.services ?? []) {
      values.push({
        key: `SERVICE:${service.id}`,
        value: service.title,
        label: `${service.title} · услуга · ${formatServicePrice(service)}`,
        catalogKind: 'SERVICE',
        service,
      });
    }
    return values;
  }, [catalogQuery.data]);

  const plannedCount = items.reduce((sum, item) => sum + (item?.dates?.filter((date) => date?.at).length ?? 0), 0);

  function generateRepeat(itemIndex: number) {
    const item = form.getFieldValue(['items', itemIndex]);
    const firstValue = item?.dates?.[0]?.at;
    const first = firstValue ? new Date(firstValue) : null;
    const repeatEvery = Number(item?.repeatEvery ?? 1);
    const repeatCount = Number(item?.repeatCount ?? 1);
    const repeatUnit = item?.repeatUnit ?? 'DAYS';

    if (!first || Number.isNaN(first.getTime())) {
      message.warning('Сначала укажите первую дату и время');
      return;
    }
    if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || !Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 60) {
      message.warning('Проверьте интервал и количество выполнений');
      return;
    }

    const intervalMs = repeatEvery * (repeatUnit === 'HOURS' ? 60 * 60_000 : 24 * 60 * 60_000);
    const dates = Array.from({ length: repeatCount }, (_, index) => ({
      at: toDatetimeInput(new Date(first.getTime() + index * intervalMs)),
    }));
    form.setFieldValue(['items', itemIndex, 'dates'], dates);
    message.success(`Сформировано дат: ${repeatCount}`);
  }

  function submit(values: TreatmentPlanFormValues) {
    onSubmit({
      title: values.title?.trim() || undefined,
      items: values.items.map((item) => ({
        recordType: item.recordType,
        title: item.title.trim(),
        value: item.value?.trim() || undefined,
        notes: item.notes?.trim() || undefined,
        productId: item.productId,
        serviceId: item.serviceId,
        quantity: item.catalogKind ? item.quantity : undefined,
        stockQuantity: item.catalogKind === 'PRODUCT' ? item.stockQuantity : undefined,
        unitPrice: item.catalogKind ? item.unitPrice : undefined,
        scheduledAt: item.dates.map((date) => new Date(date.at).toISOString()),
      })),
    });
  }

  return (
    <Modal
      title="Назначить план лечения"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={`Назначить${plannedCount ? ` · ${plannedCount}` : ''}`}
      cancelText="Отмена"
      confirmLoading={loading}
      okButtonProps={{ disabled: plannedCount < 1 || plannedCount > 200 }}
      destroyOnHidden
      width={980}
    >
      <Alert
        type="info"
        showIcon
        className="form-alert"
        message="Добавьте все препараты, процедуры и наблюдения одним планом"
        description="Для каждого пункта можно указать несколько точных дат или сформировать повтор. После сохранения каждое выполнение отмечается отдельной галочкой — переписывать назначение не нужно."
      />
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="title" label="Название плана, если нужно">
          <Input placeholder="Например: Послеоперационное лечение" maxLength={200} />
        </Form.Item>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={14} className="full-width">
              {fields.map((field, itemIndex) => (
                <section className="hospital-treatment-plan-item" key={field.key}>
                  <div className="hospital-treatment-plan-item-heading">
                    <Typography.Title level={5} className="compact-title">Назначение {itemIndex + 1}</Typography.Title>
                    {fields.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Удалить</Button> : null}
                  </div>
                  <div className="form-grid two-columns">
                    <Form.Item name={[field.name, 'recordType']} label="Тип" rules={[{ required: true, message: 'Выберите тип' }]}>
                      <Select options={recordTypeOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'title']} label="Препарат, процедура или действие" rules={[{ required: true, message: 'Укажите назначение' }, { min: 2, message: 'Минимум 2 символа' }]}>
                      <AutoComplete
                        options={catalogOptions}
                        placeholder="Начните вводить название"
                        onSearch={(value) => {
                          setCatalogSearch(value);
                          const current = form.getFieldValue(['items', field.name]);
                          if (!current?.productId && !current?.serviceId) return;
                          form.setFieldsValue({
                            items: replaceTreatmentPlanItem(form.getFieldValue('items'), field.name, {
                              catalogKind: undefined,
                              productId: undefined,
                              serviceId: undefined,
                              quantity: undefined,
                              stockQuantity: undefined,
                              unitPrice: undefined,
                              writeOffUnit: undefined,
                              billingUnit: undefined,
                              stockUnit: undefined,
                              stockRest: undefined,
                            }),
                          });
                        }}
                        filterOption={(input, option) => String(option?.value ?? '').toLocaleLowerCase('ru-RU').includes(input.toLocaleLowerCase('ru-RU'))}
                        onSelect={(_, option) => {
                          const selected = option as CatalogPlanOption;
                          const product = selected.product;
                          const service = selected.service;
                          form.setFieldsValue({
                            items: replaceTreatmentPlanItem(form.getFieldValue('items'), field.name, {
                              recordType: product ? 'MEDICATION' : 'PROCEDURE',
                              title: product?.title ?? service?.title ?? '',
                              catalogKind: selected.catalogKind,
                              productId: product?.id,
                              serviceId: service?.id,
                              quantity: 1,
                              stockQuantity: product ? 1 : undefined,
                              unitPrice: product ? Number(product.retailPrice) : getServiceDefaultPrice(service),
                              writeOffUnit: product?.writeOffUnit ?? undefined,
                              billingUnit: product?.billingUnit ?? undefined,
                              stockUnit: product?.stockUnit ?? undefined,
                              stockRest: product?.stockRest === undefined ? undefined : String(product.stockRest),
                            }),
                          });
                        }}
                      />
                    </Form.Item>
                  </div>
                  {items[field.name]?.catalogKind === 'PRODUCT' ? (
                    <>
                      <Alert
                        type="success"
                        showIcon
                        className="form-alert"
                        message="Товар связан со складом и счётом"
                        description={`Остаток: ${items[field.name]?.stockRest ?? '—'} ${items[field.name]?.stockUnit ?? ''}. Списание и начисление произойдут только после отметки «Выполнено».`}
                      />
                      <div className="form-grid two-columns">
                        <Form.Item
                          name={[field.name, 'stockQuantity']}
                          label={`Списать при каждом выполнении, ${planWriteOffUnit(items[field.name])}`}
                          rules={[{ required: true, message: 'Укажите объём для списания' }]}
                        >
                          <InputNumber min={0.001} precision={3} className="full-width" placeholder="Например: 0,5" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'quantity']}
                          label={`Начислить владельцу, ${planBillingUnit(items[field.name])}`}
                          rules={[{ required: true, message: 'Укажите количество для счёта' }]}
                        >
                          <InputNumber min={0.001} precision={3} className="full-width" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'unitPrice']}
                          label={`Цена за 1 ${planBillingUnit(items[field.name])}, ₽`}
                          rules={[{ required: true, message: 'Укажите цену' }]}
                        >
                          <InputNumber min={0} precision={2} className="full-width" />
                        </Form.Item>
                      </div>
                    </>
                  ) : null}
                  {items[field.name]?.catalogKind === 'SERVICE' ? (
                    <>
                      <Alert
                        type="success"
                        showIcon
                        className="form-alert"
                        message="Услуга связана со счётом"
                        description={`Начисление произойдёт только после отметки «Выполнено». ${getServicePriceHelp(findPlanService(items[field.name]?.serviceId, catalogQuery.data?.services)) ?? ''}`}
                      />
                      <div className="form-grid two-columns">
                        <Form.Item name={[field.name, 'quantity']} label="Количество услуг при выполнении" rules={[{ required: true, message: 'Укажите количество' }]}>
                          <InputNumber min={0.001} precision={3} className="full-width" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'unitPrice']}
                          label="Фактическая цена за одну услугу, ₽"
                          rules={servicePriceRules(findPlanService(items[field.name]?.serviceId, catalogQuery.data?.services))}
                        >
                          <InputNumber
                            min={getServicePriceRange(findPlanService(items[field.name]?.serviceId, catalogQuery.data?.services))?.minimum ?? 0}
                            max={getServicePriceRange(findPlanService(items[field.name]?.serviceId, catalogQuery.data?.services))?.maximum}
                            precision={2}
                            className="full-width"
                          />
                        </Form.Item>
                      </div>
                    </>
                  ) : null}
                  <div className="form-grid two-columns">
                    <Form.Item name={[field.name, 'value']} label="Доза, способ введения или объём">
                      <Input placeholder="Например: 0,5 мл внутримышечно" maxLength={500} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'notes']} label="Дополнительные указания">
                      <Input placeholder="Например: после кормления" maxLength={2000} />
                    </Form.Item>
                  </div>
                  <Typography.Text strong>Когда выполнить</Typography.Text>
                  <Form.List name={[field.name, 'dates']}>
                    {(dateFields, { add: addDate, remove: removeDate }) => (
                      <div className="hospital-treatment-dates">
                        {dateFields.map((dateField, dateIndex) => (
                          <Space key={dateField.key} align="start" className="hospital-treatment-date-row">
                            <Form.Item
                              name={[dateField.name, 'at']}
                              label={`Дата и время ${dateIndex + 1}`}
                              rules={[{ required: true, message: 'Укажите дату и время' }]}
                            >
                              <Input type="datetime-local" />
                            </Form.Item>
                            <Button
                              danger
                              type="text"
                              aria-label="Удалить дату"
                              icon={<DeleteOutlined />}
                              disabled={dateFields.length === 1}
                              onClick={() => removeDate(dateField.name)}
                            />
                          </Space>
                        ))}
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => addDate({ at: nextSuggestedDate(form.getFieldValue(['items', field.name, 'dates'])) })}>
                          Добавить точную дату
                        </Button>
                      </div>
                    )}
                  </Form.List>
                  <div className="hospital-treatment-repeat">
                    <Typography.Text strong>Быстро сформировать повтор</Typography.Text>
                    <Space wrap align="end">
                      <Form.Item name={[field.name, 'repeatEvery']} label="Каждые" className="compact-form-item">
                        <InputNumber min={1} max={30} precision={0} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'repeatUnit']} label="Период" className="compact-form-item">
                        <Select className="hospital-repeat-unit" options={[{ value: 'HOURS', label: 'часов' }, { value: 'DAYS', label: 'дней' }]} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'repeatCount']} label="Выполнений" className="compact-form-item">
                        <InputNumber min={1} max={60} precision={0} />
                      </Form.Item>
                      <Button icon={<CopyOutlined />} onClick={() => generateRepeat(field.name)}>Сформировать даты</Button>
                    </Space>
                  </div>
                </section>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add(newTreatmentPlanItem())}>
                Добавить препарат, процедуру или другое действие
              </Button>
            </Space>
          )}
        </Form.List>
        <Alert
          type={plannedCount > 200 ? 'error' : 'success'}
          showIcon
          className="form-alert hospital-treatment-plan-summary"
          message={plannedCount > 200 ? 'Слишком много выполнений в одном плане' : `Будет создано назначений: ${plannedCount}`}
          description={plannedCount > 200 ? 'Уменьшите число дат до 200.' : 'Каждое появится в листе стационара в своё время и будет отмечаться отдельно.'}
        />
      </Form>
    </Modal>
  );
}

function findPlanService(serviceId: string | undefined, services: HospitalCatalog['services'] | undefined) {
  return services?.find((service) => service.id === serviceId);
}

function servicePriceRules(service: HospitalCatalog['services'][number] | undefined) {
  const range = getServicePriceRange(service);
  return [
    { required: true, message: 'Укажите цену' },
    ...(range ? [{ type: 'number' as const, min: range.minimum, max: range.maximum, message: `Цена должна быть от ${range.minimum} до ${range.maximum} ₽` }] : []),
  ];
}

function newTreatmentPlanItem(): TreatmentPlanFormValues['items'][number] {
  return {
    recordType: 'MEDICATION',
    title: '',
    value: '',
    notes: '',
    catalogKind: undefined,
    productId: undefined,
    serviceId: undefined,
    quantity: undefined,
    stockQuantity: undefined,
    unitPrice: undefined,
    dates: [{ at: toDatetimeInput(new Date(Date.now() + 5 * 60_000)) }],
    repeatEvery: 1,
    repeatUnit: 'DAYS',
    repeatCount: 3,
  };
}

function replaceTreatmentPlanItem(
  items: TreatmentPlanFormValues['items'] | undefined,
  index: number,
  changes: Partial<TreatmentPlanFormValues['items'][number]>,
) {
  const next = [...(items ?? [])];
  next[index] = { ...next[index], ...changes };
  return next;
}

function planWriteOffUnit(item: TreatmentPlanFormValues['items'][number] | undefined) {
  return item?.writeOffUnit || item?.stockUnit || 'ед.';
}

function planBillingUnit(item: TreatmentPlanFormValues['items'][number] | undefined) {
  return item?.billingUnit || item?.writeOffUnit || item?.stockUnit || 'ед.';
}

function nextSuggestedDate(dates: Array<{ at?: string }> | undefined) {
  const last = dates?.at(-1)?.at;
  const base = last ? new Date(last) : new Date();
  return toDatetimeInput(new Date(base.getTime() + 24 * 60 * 60_000));
}

function toDatetimeInput(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

const recordTypeOptions: Array<{ value: HospitalRecordType; label: string }> = [
  { value: 'MEDICATION', label: 'Препарат / инъекция' },
  { value: 'PROCEDURE', label: 'Процедура' },
  { value: 'TEMPERATURE', label: 'Температура' },
  { value: 'OBSERVATION', label: 'Наблюдение' },
  { value: 'FEEDING', label: 'Кормление' },
  { value: 'CARE', label: 'Уход' },
  { value: 'OTHER', label: 'Другое действие' },
];
