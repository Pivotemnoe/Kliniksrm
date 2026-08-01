import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  EditOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import {
  cancelHospitalStay,
  createHospitalRecord,
  dischargeHospitalStay,
  getHospitalResources,
  getHospitalCatalog,
  getHospitalStay,
  updateHospitalRecord,
  updateHospitalStay,
} from './hospital.api';
import type { CreateHospitalRecordInput, HospitalCatalog, HospitalRecord, HospitalRecordType, UpdateHospitalRecordInput } from './types';

const recordTypeOptions: Array<{ value: HospitalRecordType; label: string; defaultTitle: string }> = [
  { value: 'TEMPERATURE', label: 'Температура', defaultTitle: 'Измерение температуры' },
  { value: 'MEDICATION', label: 'Препарат / инъекция', defaultTitle: 'Введение препарата' },
  { value: 'PROCEDURE', label: 'Процедура', defaultTitle: 'Выполненная процедура' },
  { value: 'OBSERVATION', label: 'Наблюдение', defaultTitle: 'Состояние пациента' },
  { value: 'FEEDING', label: 'Кормление', defaultTitle: 'Кормление' },
  { value: 'CARE', label: 'Уход', defaultTitle: 'Уход за пациентом' },
  { value: 'OTHER', label: 'Другая запись', defaultTitle: 'Запись стационара' },
];

export function HospitalCardPage() {
  const { stayId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'hospital.manage');
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HospitalRecord | null>(null);
  const [boxId, setBoxId] = useState<string>();
  const stayQuery = useQuery({
    queryKey: ['hospital', stayId],
    queryFn: () => getHospitalStay(stayId),
    enabled: Boolean(stayId),
  });
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources });
  const stay = stayQuery.data;
  const active = stay?.status === 'ACTIVE';

  useEffect(() => {
    setBoxId(stay?.hospitalBoxId ?? undefined);
  }, [stay?.hospitalBoxId]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hospital', stayId] }),
      queryClient.invalidateQueries({ queryKey: ['hospital'] }),
      queryClient.invalidateQueries({ queryKey: ['visits', stay?.sourceVisitId] }),
      queryClient.invalidateQueries({ queryKey: ['visits'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
    ]);
  }

  const transferMutation = useMutation({
    mutationFn: (nextBoxId: string) => updateHospitalStay(stayId, { hospitalBoxId: nextBoxId }),
    onSuccess: async () => { await refresh(); message.success('Пациент переведён в другой бокс'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'discharge' | 'cancel') =>
      action === 'discharge' ? dischargeHospitalStay(stayId) : cancelHospitalStay(stayId),
    onSuccess: async (_, action) => {
      await refresh();
      message.success(action === 'discharge' ? 'Пациент выписан из стационара' : 'Госпитализация отменена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const recordMutation = useMutation({
    mutationFn: (input: CreateHospitalRecordInput | UpdateHospitalRecordInput) => editingRecord
      ? updateHospitalRecord(stayId, editingRecord.id, input as UpdateHospitalRecordInput)
      : createHospitalRecord(stayId, input as CreateHospitalRecordInput),
    onSuccess: async () => {
      await refresh();
      setRecordOpen(false);
      message.success(editingRecord ? 'Запись стационара обновлена' : 'Запись добавлена в карту стационара');
      setEditingRecord(null);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const journalColumns = useMemo<ColumnsType<HospitalRecord>>(() => [
    { title: 'Дата и время', dataIndex: 'recordedAt', width: 175, render: formatDateTime },
    {
      title: 'Запись',
      key: 'record',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space wrap size={6}>
            <Tag color={recordTypeColor[record.recordType]}>{recordTypeLabel[record.recordType]}</Tag>
            <Typography.Text strong>{record.title}</Typography.Text>
          </Space>
          {record.temperatureC !== null ? <Typography.Text>{record.temperatureC} °C</Typography.Text> : null}
          {record.value ? <Typography.Text>{record.value}</Typography.Text> : null}
          {record.notes ? <Typography.Text type="secondary">{record.notes}</Typography.Text> : null}
          {record.billItem ? (
            <Space wrap size={6}>
              <Tag color={record.billItem.productId ? 'gold' : 'green'}>
                {record.billItem.productId ? 'Товар и списание' : 'Услуга'}
              </Tag>
              <Typography.Text>
                {record.billItem.title}: {record.billItem.quantity} × {formatMoney(record.billItem.unitPrice)} = {formatMoney(record.billItem.totalAmount)}
              </Typography.Text>
              {record.billItem.productId && record.billItem.stockQuantity !== null ? (
                <Typography.Text type="secondary">
                  списано {record.billItem.stockQuantity} {record.billItem.product?.writeOffUnit || record.billItem.product?.stockUnit || 'ед.'}
                </Typography.Text>
              ) : null}
            </Space>
          ) : null}
        </Space>
      ),
    },
    { title: 'Выполнил', key: 'employee', width: 220, render: (_, record) => record.recordedBy?.fullName ?? 'Сотрудник не указан' },
    ...(canManage ? [{
      title: 'Действия',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, record: HospitalRecord) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingRecord(record); setRecordOpen(true); }}>
          Изменить
        </Button>
      ),
    }] : []),
  ], [canManage]);

  if (stayQuery.isError) {
    return <div className="page"><PageHeader title="Карта стационара" /><Alert type="error" showIcon message="Не удалось открыть карту стационара" description={getErrorMessage(stayQuery.error)} /></div>;
  }

  return (
    <div className="page hospital-card-page">
      <PageHeader
        title={stay ? `Стационар: ${stay.animal?.nickname ?? 'пациент'}` : 'Карта стационара'}
        description={stay ? `${stay.hospitalBox?.name ?? 'Бокс не указан'} · поступил ${formatDateTime(stay.startedAt)}` : 'Наблюдения и выполненные назначения пациента.'}
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/hospital')}>К стационару</Button>
            {stay ? <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits/${stay.sourceVisitId}`)}>Осмотр при поступлении</Button> : null}
            {canManage && active ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingRecord(null); setRecordOpen(true); }}>Добавить запись</Button> : null}
          </Space>
        }
      />
      {stay ? (
        <>
          <div className="list-panel hospital-summary-panel">
            <div className="list-panel-body">
              <Descriptions bordered column={{ xs: 1, md: 2, xl: 3 }}>
                <Descriptions.Item label="Пациент"><Typography.Link onClick={() => navigate(`/patients/${stay.animalId}`)}>{stay.animal?.nickname ?? 'Пациент'}</Typography.Link></Descriptions.Item>
                <Descriptions.Item label="Вид"><AnimalSpeciesLabel species={stay.animal?.species} /></Descriptions.Item>
                <Descriptions.Item label="Владелец"><Typography.Link onClick={() => navigate(`/owners/${stay.ownerId}`)}>{stay.owner?.fullName ?? '—'}</Typography.Link></Descriptions.Item>
                <Descriptions.Item label="Ответственный">{stay.employee?.fullName ?? 'Не назначен'}</Descriptions.Item>
                <Descriptions.Item label="Статус"><Tag color={hospitalStatusColors[stay.status]}>{hospitalStatusLabels[stay.status]}</Tag></Descriptions.Item>
                <Descriptions.Item label="Счёт">{stay.bill ? `${formatMoney(stay.bill.totalAmount)} · оплачено ${formatMoney(stay.bill.paidAmount)}` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Причина помещения" span={3}>{stay.exam?.purpose || 'Не указана'}</Descriptions.Item>
              </Descriptions>
              {canManage && active ? (
                <div className="hospital-card-actions">
                  <Select
                    value={boxId}
                    placeholder="Выберите бокс"
                    options={resourcesQuery.data?.boxes.map((box) => ({ value: box.id, label: box.name })) ?? []}
                    className="visit-hospital-select"
                    onChange={setBoxId}
                  />
                  <Button icon={<SwapOutlined />} disabled={!boxId || boxId === stay.hospitalBoxId} loading={transferMutation.isPending} onClick={() => boxId && transferMutation.mutate(boxId)}>Перевести</Button>
                  <Button icon={<CheckOutlined />} loading={actionMutation.isPending} onClick={() => modal.confirm({ title: 'Выписать пациента из стационара?', okText: 'Выписать', cancelText: 'Отмена', onOk: () => actionMutation.mutateAsync('discharge') })}>Выписать</Button>
                  <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => modal.confirm({ title: 'Отменить госпитализацию?', okText: 'Отменить', cancelText: 'Назад', okButtonProps: { danger: true }, onOk: () => actionMutation.mutateAsync('cancel') })}>Отменить</Button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="list-panel">
            <div className="list-panel-header">
              <div>
                <Typography.Title level={4} className="compact-title">Журнал стационара</Typography.Title>
                <Typography.Text type="secondary">Температура, препараты, процедуры, наблюдения, кормление и уход — отдельными записями по времени.</Typography.Text>
              </div>
              {canManage && active ? <Button icon={<PlusOutlined />} onClick={() => { setEditingRecord(null); setRecordOpen(true); }}>Добавить запись</Button> : null}
            </div>
            <div className="list-panel-body">
              <Table<HospitalRecord>
                rowKey="id"
                columns={journalColumns}
                dataSource={stay.hospitalRecords ?? []}
                pagination={false}
                loading={stayQuery.isLoading}
                locale={{ emptyText: 'В журнале пока нет записей' }}
                scroll={{ x: 760 }}
              />
            </div>
          </div>
        </>
      ) : null}
      <HospitalRecordModal
        open={recordOpen}
        record={editingRecord}
        billingLocked={Number(stay?.bill?.paidAmount ?? 0) > 0}
        loading={recordMutation.isPending}
        onClose={() => { setRecordOpen(false); setEditingRecord(null); }}
        onSubmit={(values) => recordMutation.mutate({
          ...values,
          recordedAt: values.recordedAt ? new Date(values.recordedAt).toISOString() : undefined,
        })}
      />
    </div>
  );
}

type HospitalRecordFormValues = CreateHospitalRecordInput & { catalogKind?: 'NONE' | 'PRODUCT' | 'SERVICE' };

function HospitalRecordModal({
  open,
  record,
  billingLocked,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: HospitalRecord | null;
  billingLocked: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: CreateHospitalRecordInput) => void;
}) {
  const [form] = Form.useForm<HospitalRecordFormValues>();
  const recordType = Form.useWatch('recordType', form);
  const catalogKind = Form.useWatch('catalogKind', form) ?? 'NONE';
  const selectedProductId = Form.useWatch('productId', form);
  const [catalogSearch, setCatalogSearch] = useState('');
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const catalogQuery = useQuery({
    queryKey: ['hospital', 'catalog', deferredCatalogSearch],
    queryFn: () => getHospitalCatalog(deferredCatalogSearch || undefined),
    enabled: open && catalogKind !== 'NONE',
  });
  const catalogIdentityLocked = Boolean(record);

  useEffect(() => {
    if (!open) return;
    setCatalogSearch('');
    if (!record) {
      form.setFieldsValue({
        recordType: 'OBSERVATION',
        title: 'Состояние пациента',
        recordedAt: toDatetimeInput(new Date()),
        value: '',
        notes: '',
        temperatureC: undefined,
        catalogKind: 'NONE',
        productId: undefined,
        serviceId: undefined,
        quantity: 1,
        stockQuantity: 1,
        unitPrice: undefined,
      });
      return;
    }

    form.setFieldsValue({
      recordType: record.recordType,
      title: record.title,
      recordedAt: toDatetimeInput(new Date(record.recordedAt)),
      value: record.value ?? '',
      notes: record.notes ?? '',
      temperatureC: record.temperatureC === null ? undefined : Number(record.temperatureC),
      catalogKind: record.billItem?.productId ? 'PRODUCT' : record.billItem?.serviceId ? 'SERVICE' : 'NONE',
      productId: record.billItem?.productId ?? undefined,
      serviceId: record.billItem?.serviceId ?? undefined,
      quantity: record.billItem ? Number(record.billItem.quantity) : 1,
      stockQuantity: record.billItem?.stockQuantity === null || record.billItem?.stockQuantity === undefined
        ? undefined
        : Number(record.billItem.stockQuantity),
      unitPrice: record.billItem ? Number(record.billItem.unitPrice) : undefined,
    });
  }, [form, open, record]);

  function submit(values: HospitalRecordFormValues) {
    const { catalogKind: _catalogKind, ...rawInput } = values;
    const input = normalizeHospitalRecord(rawInput);
    if (record) {
      delete input.productId;
      delete input.serviceId;
    }
    if (billingLocked) {
      delete input.quantity;
      delete input.stockQuantity;
      delete input.unitPrice;
    }
    if (catalogKind === 'NONE') {
      delete input.productId;
      delete input.serviceId;
      delete input.quantity;
      delete input.stockQuantity;
      delete input.unitPrice;
    }
    onSubmit(input);
  }

  return (
    <Modal title={record ? 'Изменить запись стационара' : 'Новая запись стационара'} open={open} onCancel={onClose} onOk={() => form.submit()} okText={record ? 'Сохранить' : 'Добавить'} cancelText="Отмена" confirmLoading={loading} destroyOnHidden width={760}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="recordType" label="Тип записи" rules={[{ required: true, message: 'Выберите тип записи' }]}>
          <Select
            options={recordTypeOptions.map(({ value, label }) => ({ value, label }))}
            onChange={(value: HospitalRecordType) => {
              const option = recordTypeOptions.find((item) => item.value === value);
              form.setFieldValue('title', option?.defaultTitle ?? 'Запись стационара');
            }}
          />
        </Form.Item>
        <Form.Item name="recordedAt" label="Дата и время" rules={[{ required: true, message: 'Укажите время записи' }]}>
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="title" label={recordType === 'MEDICATION' ? 'Препарат или назначение' : 'Название'} rules={[{ required: true, message: 'Заполните название' }, { min: 2, message: 'Минимум 2 символа' }]}>
          <Input placeholder={recordType === 'MEDICATION' ? 'Например: Цефтриаксон' : 'Краткое название записи'} />
        </Form.Item>
        {recordType === 'TEMPERATURE' ? (
          <Form.Item
            name="temperatureC"
            label="Температура, °C"
            rules={[
              { required: true, message: 'Введите температуру' },
              {
                validator: (_, value) => {
                  const temperature = Number(String(value ?? '').replace(',', '.'));
                  return Number.isFinite(temperature) && temperature >= 30 && temperature <= 45
                    ? Promise.resolve()
                    : Promise.reject(new Error('Введите температуру от 30,0 до 45,0 °C'));
                },
              },
            ]}
          >
            <Input inputMode="decimal" placeholder="Например: 38,5" />
          </Form.Item>
        ) : (
          <Form.Item name="value" label={recordType === 'MEDICATION' ? 'Доза и способ введения' : 'Результат / объём'}>
            <Input placeholder={recordType === 'MEDICATION' ? 'Например: 0,5 мл внутримышечно' : 'При необходимости'} />
          </Form.Item>
        )}
        <Form.Item name="notes" label="Комментарий">
          <Input.TextArea rows={4} placeholder="Состояние пациента, реакция или дополнительные сведения" />
        </Form.Item>
        <Typography.Title level={5}>Учёт в счёте и на складе</Typography.Title>
        <Typography.Paragraph type="secondary">
          Выбранная услуга попадёт в счёт по цене прайса. Товар попадёт в счёт и одновременно спишется с доступной партии склада.
        </Typography.Paragraph>
        {record && !record.billItem ? (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message="У этой записи не было начисления"
            description="Медицинский текст можно исправить. Чтобы добавить товар или услугу, создайте отдельную запись — так сохранится правильная история действий."
          />
        ) : null}
        {billingLocked && record?.billItem ? (
          <Alert
            type="warning"
            showIcon
            className="form-alert"
            message="Счёт уже оплачивался"
            description="Текст записи можно исправить, но количество списания и цену оплаченного счёта менять нельзя."
          />
        ) : null}
        <Form.Item name="catalogKind" label="Что учесть">
          <Select
            disabled={catalogIdentityLocked}
            options={[
              { value: 'NONE', label: 'Только запись в журнале, без начисления' },
              { value: 'PRODUCT', label: 'Товар — начислить и списать со склада' },
              { value: 'SERVICE', label: 'Услуга — начислить по прайсу' },
            ]}
            onChange={(kind: HospitalRecordFormValues['catalogKind']) => {
              form.setFieldsValue({
                productId: undefined,
                serviceId: undefined,
                quantity: kind === 'NONE' ? undefined : 1,
                stockQuantity: kind === 'PRODUCT' ? 1 : undefined,
                unitPrice: undefined,
              });
            }}
          />
        </Form.Item>
        {catalogKind === 'PRODUCT' ? (
          <>
            <Form.Item name="productId" label="Товар из каталога" rules={[{ required: true, message: 'Выберите товар' }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={setCatalogSearch}
                loading={catalogQuery.isFetching}
                disabled={catalogIdentityLocked}
                placeholder="Начните вводить название, артикул или штрих-код"
                options={mergeProductOptions(record, catalogQuery.data?.products).map((product) => ({
                  value: product.id,
                  label: `${product.title} · остаток ${product.stockRest ?? '—'} ${product.stockUnit ?? ''}`,
                }))}
                onChange={(productId) => {
                  const product = catalogQuery.data?.products.find((item) => item.id === productId);
                  if (!product) return;
                  form.setFieldsValue({
                    title: product.title,
                    quantity: 1,
                    stockQuantity: 1,
                    unitPrice: Number(product.retailPrice),
                  });
                }}
              />
            </Form.Item>
            <div className="form-grid two-columns">
              <Form.Item name="stockQuantity" label={`Списать со склада, ${selectedProductWriteOffUnit(selectedProductId, record, catalogQuery.data?.products)}`} rules={[{ required: true, message: 'Укажите количество для списания' }]}>
                <InputNumber min={0.001} precision={3} disabled={billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="quantity" label={`Начислить клиенту, ${selectedProductBillingUnit(selectedProductId, record, catalogQuery.data?.products)}`} rules={[{ required: true, message: 'Укажите количество начислений' }]}>
                <InputNumber min={0.001} precision={3} disabled={billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="unitPrice" label={`Цена за 1 ${selectedProductBillingUnit(selectedProductId, record, catalogQuery.data?.products)}, ₽`} rules={[{ required: true, message: 'Укажите цену' }]}>
                <InputNumber min={0} precision={2} disabled={billingLocked} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
        {catalogKind === 'SERVICE' ? (
          <>
            <Form.Item name="serviceId" label="Услуга из прайса" rules={[{ required: true, message: 'Выберите услугу' }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={setCatalogSearch}
                loading={catalogQuery.isFetching}
                disabled={catalogIdentityLocked}
                placeholder="Начните вводить название услуги"
                options={mergeServiceOptions(record, catalogQuery.data?.services).map((service) => ({
                  value: service.id,
                  label: `${service.title} · ${formatMoney(service.price)}`,
                }))}
                onChange={(serviceId) => {
                  const service = catalogQuery.data?.services.find((item) => item.id === serviceId);
                  if (!service) return;
                  form.setFieldsValue({ title: service.title, quantity: 1, unitPrice: Number(service.price) });
                }}
              />
            </Form.Item>
            <div className="form-grid two-columns">
              <Form.Item name="quantity" label="Количество услуг" rules={[{ required: true, message: 'Укажите количество' }]}>
                <InputNumber min={0.001} precision={3} disabled={billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="unitPrice" label="Цена за одну услугу, ₽" rules={[{ required: true, message: 'Укажите цену' }]}>
                <InputNumber min={0} precision={2} disabled={billingLocked} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}

const recordTypeLabel: Record<HospitalRecordType, string> = Object.fromEntries(recordTypeOptions.map((item) => [item.value, item.label])) as Record<HospitalRecordType, string>;
const recordTypeColor: Record<HospitalRecordType, string> = {
  TEMPERATURE: 'volcano',
  MEDICATION: 'blue',
  PROCEDURE: 'purple',
  OBSERVATION: 'cyan',
  FEEDING: 'green',
  CARE: 'geekblue',
  OTHER: 'default',
};

function toDatetimeInput(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

const hospitalStatusLabels = {
  ACTIVE: 'В стационаре',
  DISCHARGED: 'Выписан',
  CANCELLED: 'Отменён',
} as const;

const hospitalStatusColors = {
  ACTIVE: 'processing',
  DISCHARGED: 'success',
  CANCELLED: 'default',
} as const;

function normalizeHospitalRecord(values: CreateHospitalRecordInput): CreateHospitalRecordInput {
  if (values.temperatureC === undefined || values.temperatureC === null) {
    return values;
  }

  return {
    ...values,
    temperatureC: Math.round(Number(String(values.temperatureC).replace(',', '.')) * 10) / 10,
  };
}

function mergeProductOptions(
  record: HospitalRecord | null,
  products: HospitalCatalog['products'] | undefined,
): HospitalCatalog['products'] {
  const items = [...(products ?? [])];
  const linked = record?.billItem?.product;
  if (linked && !items.some((item) => item.id === linked.id)) {
    items.unshift({
      ...linked,
      retailPrice: record?.billItem?.unitPrice ?? 0,
      stockRest: '—',
    });
  }
  return items;
}

function mergeServiceOptions(
  record: HospitalRecord | null,
  services: HospitalCatalog['services'] | undefined,
): HospitalCatalog['services'] {
  const items = [...(services ?? [])];
  const linked = record?.billItem?.service;
  if (linked && !items.some((item) => item.id === linked.id)) {
    items.unshift({ ...linked, price: record?.billItem?.unitPrice ?? 0 });
  }
  return items;
}

function selectedProductWriteOffUnit(
  productId: string | undefined,
  record: HospitalRecord | null,
  products: HospitalCatalog['products'] | undefined,
) {
  const product = mergeProductOptions(record, products).find((item) => item.id === productId);
  return product?.writeOffUnit || product?.stockUnit || 'ед.';
}

function selectedProductBillingUnit(
  productId: string | undefined,
  record: HospitalRecord | null,
  products: HospitalCatalog['products'] | undefined,
) {
  const product = mergeProductOptions(record, products).find((item) => item.id === productId);
  return product?.billingUnit || product?.writeOffUnit || product?.stockUnit || 'ед.';
}
