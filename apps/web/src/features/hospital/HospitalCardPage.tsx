import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  PlusOutlined,
  PrinterOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography } from 'antd';
import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listVisitFiles, uploadVisitFile } from '../files/files.api';
import { getOrganizationSettings } from '../organization/organization.api';
import {
  cancelHospitalStay,
  createHospitalAmendment,
  createHospitalRecord,
  createHospitalTreatmentPlan,
  dischargeHospitalStay,
  getHospitalResources,
  getHospitalCatalog,
  getHospitalStay,
  updateHospitalRecord,
  updateHospitalStay,
} from './hospital.api';
import { HospitalSheet } from './HospitalSheet';
import { HospitalTreatmentPlanModal } from './HospitalTreatmentPlanModal';
import { printHospitalSheet } from './hospitalPrint';
import type { CreateHospitalAmendmentInput, CreateHospitalRecordInput, HospitalCatalog, HospitalRecord, HospitalRecordStatus, HospitalRecordType, UpdateHospitalRecordInput } from './types';

const recordTypeOptions: Array<{ value: HospitalRecordType; label: string; defaultTitle: string }> = [
  { value: 'TEMPERATURE', label: 'Температура', defaultTitle: 'Измерение температуры' },
  { value: 'MEDICATION', label: 'Препарат / инъекция', defaultTitle: 'Введение препарата' },
  { value: 'PROCEDURE', label: 'Процедура', defaultTitle: 'Процедура' },
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
  const canReadDocuments = hasPermission(auth?.employee, 'documents.read');
  const canManageDocuments = hasPermission(auth?.employee, 'documents.manage');
  const canPrint = hasPermission(auth?.employee, 'documents.print');
  const [recordOpen, setRecordOpen] = useState(false);
  const [treatmentPlanOpen, setTreatmentPlanOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HospitalRecord | null>(null);
  const [initialRecordStatus, setInitialRecordStatus] = useState<Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED'>>('COMPLETED');
  const [amendmentRecord, setAmendmentRecord] = useState<HospitalRecord | null>(null);
  const [boxId, setBoxId] = useState<string>();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const stayQuery = useQuery({
    queryKey: ['hospital', stayId],
    queryFn: () => getHospitalStay(stayId),
    enabled: Boolean(stayId),
  });
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources });
  const organizationQuery = useQuery({ queryKey: ['organization'], queryFn: getOrganizationSettings });
  const stay = stayQuery.data;
  const active = stay?.status === 'ACTIVE';

  useEffect(() => {
    setBoxId(stay?.hospitalBoxId ?? undefined);
  }, [stay?.hospitalBoxId]);

  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);

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
    onSuccess: async (_, input) => {
      await refresh();
      setRecordOpen(false);
      message.success(editingRecord
        ? 'Запись стационара обновлена'
        : input.recordStatus === 'PLANNED'
          ? 'План лечения назначен. Напоминание появится к указанному времени'
          : 'Выполненное действие добавлено в лист стационара');
      setEditingRecord(null);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const recordStatusMutation = useMutation({
    mutationFn: ({ recordId, input }: { recordId: string; input: UpdateHospitalRecordInput }) => updateHospitalRecord(stayId, recordId, input),
    onSuccess: async (_, variables) => {
      await refresh();
      message.success(variables.input.recordStatus === 'SKIPPED' ? 'Назначение отмечено как пропущенное' : 'Выполнение лечения отмечено');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const treatmentPlanMutation = useMutation({
    mutationFn: (input: Parameters<typeof createHospitalTreatmentPlan>[1]) => createHospitalTreatmentPlan(stayId, input),
    onSuccess: async (plan) => {
      await refresh();
      setTreatmentPlanOpen(false);
      message.success(`План лечения назначен: ${plan.records.length} выполнений`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const amendmentMutation = useMutation({
    mutationFn: ({ recordId, input }: { recordId: string; input: CreateHospitalAmendmentInput }) => createHospitalAmendment(stayId, recordId, input),
    onSuccess: async () => {
      await refresh();
      const amendedPlannedRecord = amendmentRecord?.recordStatus === 'PLANNED';
      setAmendmentRecord(null);
      message.success(amendedPlannedRecord
        ? 'Исправление сохранено. Чтобы провести склад и счёт, отметьте назначение «Выполнено»'
        : 'Исправление добавлено; исходная запись сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function openNewRecord(status: Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED'>) {
    setEditingRecord(null);
    setInitialRecordStatus(status);
    setRecordOpen(true);
  }

  function openEditRecord(record: HospitalRecord) {
    setEditingRecord(record);
    setInitialRecordStatus(record.recordStatus === 'PLANNED' ? 'PLANNED' : 'COMPLETED');
    setRecordOpen(true);
  }

  function openCompleteRecord(record: HospitalRecord) {
    setEditingRecord(record);
    setInitialRecordStatus('COMPLETED');
    setRecordOpen(true);
  }

  function quickCompleteRecord(record: HospitalRecord) {
    if (record.recordType === 'TEMPERATURE') {
      openCompleteRecord(record);
      return;
    }
    recordStatusMutation.mutate({
      recordId: record.id,
      input: { recordStatus: 'COMPLETED', completedAt: new Date().toISOString() },
    });
  }

  const treatmentReminder = getTreatmentReminder(stay?.hospitalRecords ?? [], nowMs);

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
            {stay && canPrint ? <Button icon={<PrinterOutlined />} onClick={() => {
              if (!printHospitalSheet(stay, organizationQuery.data)) message.warning('Браузер заблокировал окно печати');
            }}>Отчёт владельцу / PDF</Button> : null}
            {canManage && active ? <Button icon={<PlusOutlined />} onClick={() => setTreatmentPlanOpen(true)}>Назначить план лечения</Button> : null}
            {canManage && active ? <Button type="primary" icon={<PlusOutlined />} onClick={() => openNewRecord('COMPLETED')}>Записать выполненное действие</Button> : null}
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
          <div className="list-panel hospital-full-sheet-panel">
            <div className="list-panel-header">
              <div>
                <Typography.Title level={4} className="compact-title">Полный лист стационара</Typography.Title>
                <Typography.Text type="secondary">Всё пребывание на одном экране: назначения и их выполнение, температура, наблюдения и исправления.</Typography.Text>
              </div>
              <Space wrap>
                {canManage && active ? <Button onClick={() => setTreatmentPlanOpen(true)}>Назначить лечение</Button> : null}
                {canManage && active ? <Button type="primary" onClick={() => openNewRecord('COMPLETED')}>Записать выполнение</Button> : null}
              </Space>
            </div>
            <div className="list-panel-body">
              {treatmentReminder.due.length ? (
                <Alert
                  type="warning"
                  showIcon
                  className="hospital-treatment-reminder"
                  message={`Требуется выполнить лечение: ${treatmentReminder.due.length}`}
                  description={(
                    <Space direction="vertical" size={3}>
                      {treatmentReminder.due.slice(0, 5).map((record) => (
                        <Typography.Text key={record.id}>
                          <strong>{formatTreatmentDateTime(record.recordedAt, stay.timezone)}</strong> — {record.title}
                        </Typography.Text>
                      ))}
                      {treatmentReminder.due.length > 5 ? <Typography.Text type="secondary">И ещё {treatmentReminder.due.length - 5}</Typography.Text> : null}
                      {treatmentReminder.due.some((record) => record.canEditDirectly) ? (
                        <Typography.Text type="secondary">Отметьте выполнение галочкой в строке назначения.</Typography.Text>
                      ) : null}
                      {treatmentReminder.due.some((record) => !record.canEditDirectly) ? (
                        <Typography.Text type="secondary">Назначение прошлых суток можно отметить выполненным или пропущенным; исходный план останется в истории.</Typography.Text>
                      ) : null}
                    </Space>
                  )}
                />
              ) : treatmentReminder.next ? (
                <Alert
                  type="info"
                  showIcon
                  className="hospital-treatment-reminder"
                  message={`Ближайшее назначение: ${formatTreatmentDateTime(treatmentReminder.next.recordedAt, stay.timezone)}`}
                  description={treatmentReminder.next.title}
                />
              ) : null}
              <Alert
                type="info"
                showIcon
                className="form-alert"
                message={`Правило правки: записи текущих суток (${stay.timezone}) редактируются напрямую`}
                description="Прошлые сутки не переписываются: врач добавляет исправление с причиной, автором и временем. Невыполненное назначение при этом можно отдельно отметить выполненным или пропущенным."
              />
              <HospitalSheet
                records={stay.hospitalRecords ?? []}
                timeZone={stay.timezone}
                canManage={canManage}
                active={active}
                onEdit={openEditRecord}
                onAmend={setAmendmentRecord}
                onComplete={openCompleteRecord}
                onQuickComplete={quickCompleteRecord}
                onSkip={(record) => modal.confirm({
                  title: `Отметить «${record.title}» как пропущенное?`,
                  content: 'Запись останется в листе как невыполненное плановое назначение.',
                  okText: 'Отметить пропущенным',
                  cancelText: 'Отмена',
                  onOk: () => recordStatusMutation.mutateAsync({ recordId: record.id, input: { recordStatus: 'SKIPPED', completedAt: new Date().toISOString() } }),
                })}
                updatingRecordId={recordStatusMutation.isPending ? recordStatusMutation.variables?.recordId : undefined}
              />
            </div>
          </div>
          {canReadDocuments ? (
            <div className="list-panel">
              <div className="list-panel-body">
                <AttachmentsPanel
                  queryKey={['files', 'hospital-sheet', stay.sourceVisitId]}
                  listFiles={() => listVisitFiles(stay.sourceVisitId)}
                  uploadFile={(file) => uploadVisitFile(stay.sourceVisitId, file)}
                  canManage={canManageDocuments}
                  title="Итоговый лист в истории пациента"
                  description="Нажмите «Отчёт владельцу / PDF», сохраните компактный отчёт о выполненном лечении и прикрепите его сюда. Файл останется в медицинской истории исходного приёма пациента."
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <HospitalTreatmentPlanModal
        open={treatmentPlanOpen}
        loading={treatmentPlanMutation.isPending}
        onClose={() => setTreatmentPlanOpen(false)}
        onSubmit={(input) => treatmentPlanMutation.mutate(input)}
      />
      <HospitalRecordModal
        open={recordOpen}
        record={editingRecord}
        initialStatus={initialRecordStatus}
        billingLocked={Number(stay?.bill?.paidAmount ?? 0) > 0}
        loading={recordMutation.isPending}
        onClose={() => { setRecordOpen(false); setEditingRecord(null); }}
        onSubmit={(values) => recordMutation.mutate({
          ...values,
          recordedAt: values.recordedAt ? new Date(values.recordedAt).toISOString() : undefined,
        })}
      />
      <HospitalAmendmentModal
        open={Boolean(amendmentRecord)}
        record={amendmentRecord}
        loading={amendmentMutation.isPending}
        onClose={() => setAmendmentRecord(null)}
        onSubmit={(input) => amendmentRecord && amendmentMutation.mutate({ recordId: amendmentRecord.id, input })}
      />
    </div>
  );
}

type HospitalRecordFormValues = Omit<CreateHospitalRecordInput, 'recordStatus'> & {
  recordStatus?: Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED' | 'SKIPPED'>;
  catalogKind?: 'NONE' | 'PRODUCT' | 'SERVICE';
};

function HospitalRecordModal({
  open,
  record,
  initialStatus,
  billingLocked,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: HospitalRecord | null;
  initialStatus: Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED'>;
  billingLocked: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: CreateHospitalRecordInput | UpdateHospitalRecordInput) => void;
}) {
  const [form] = Form.useForm<HospitalRecordFormValues>();
  const recordType = Form.useWatch('recordType', form);
  const recordStatus = Form.useWatch('recordStatus', form) ?? initialStatus;
  const catalogKind = Form.useWatch('catalogKind', form) ?? 'NONE';
  const selectedProductId = Form.useWatch('productId', form);
  const completingPlannedRecord = record?.recordStatus === 'PLANNED' && initialStatus === 'COMPLETED';
  const lateCompletion = completingPlannedRecord && record?.canEditDirectly === false;
  const effectivePlannedCatalog = getEffectivePlannedCatalog(record);
  const hasPlannedCatalog = Boolean(effectivePlannedCatalog.productId || effectivePlannedCatalog.serviceId);
  const [catalogSearch, setCatalogSearch] = useState('');
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const catalogQuery = useQuery({
    queryKey: ['hospital', 'catalog', deferredCatalogSearch],
    queryFn: () => getHospitalCatalog(deferredCatalogSearch || undefined),
    enabled: open && catalogKind !== 'NONE',
  });
  const catalogIdentityLocked = Boolean(record)
    && (!completingPlannedRecord || Boolean(record?.billItem || hasPlannedCatalog));

  useEffect(() => {
    if (!open) return;
    setCatalogSearch('');
    if (!record) {
      form.setFieldsValue({
        recordType: 'OBSERVATION',
        recordStatus: initialStatus,
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

    const currentPlannedCatalog = getEffectivePlannedCatalog(record);
    const productId = record.billItem?.productId ?? currentPlannedCatalog.productId ?? undefined;
    const serviceId = record.billItem?.serviceId ?? currentPlannedCatalog.serviceId ?? undefined;
    form.setFieldsValue({
      recordType: record.recordType,
      recordStatus: record.recordStatus === 'PLANNED' && initialStatus === 'COMPLETED'
        ? 'COMPLETED'
        : record.recordStatus === 'AMENDMENT' ? 'COMPLETED' : record.recordStatus,
      title: record.title,
      recordedAt: toDatetimeInput(new Date(record.recordedAt)),
      value: record.value ?? '',
      notes: record.notes ?? '',
      temperatureC: record.temperatureC === null ? undefined : Number(record.temperatureC),
      catalogKind: productId ? 'PRODUCT' : serviceId ? 'SERVICE' : 'NONE',
      productId,
      serviceId,
      quantity: Number(record.billItem?.quantity ?? currentPlannedCatalog.quantity ?? 1),
      stockQuantity: productId
        ? Number(record.billItem?.stockQuantity ?? currentPlannedCatalog.stockQuantity ?? 1)
        : undefined,
      unitPrice: Number(record.billItem?.unitPrice ?? currentPlannedCatalog.unitPrice ?? 0),
    });
  }, [form, initialStatus, open, record]);

  function submit(values: HospitalRecordFormValues) {
    const { catalogKind: _catalogKind, ...rawInput } = values;
    const input = normalizeHospitalRecord(rawInput as CreateHospitalRecordInput);
    if (lateCompletion) {
      onSubmit({
        recordStatus: 'COMPLETED',
        completedAt: new Date().toISOString(),
        ...(recordType === 'TEMPERATURE' && input.temperatureC !== undefined
          ? { temperatureC: input.temperatureC }
          : {}),
      });
      return;
    }
    if (record && catalogIdentityLocked) {
      delete input.productId;
      delete input.serviceId;
    }
    if (billingLocked) {
      delete input.quantity;
      delete input.stockQuantity;
      delete input.unitPrice;
    }
    if (catalogKind === 'SERVICE') {
      delete input.stockQuantity;
    }
    if (catalogKind === 'NONE' || recordStatus === 'PLANNED') {
      delete input.productId;
      delete input.serviceId;
      delete input.quantity;
      delete input.stockQuantity;
      delete input.unitPrice;
    }
    onSubmit(input);
  }

  const modalTitle = completingPlannedRecord
    ? 'Отметить выполнение лечения'
    : record
      ? record.recordStatus === 'PLANNED' ? 'Изменить назначение лечения' : 'Изменить выполненное действие'
      : initialStatus === 'PLANNED' ? 'Назначить план лечения' : 'Записать выполненное действие';

  return (
    <Modal title={modalTitle} open={open} onCancel={onClose} onOk={() => form.submit()} okText={completingPlannedRecord ? 'Отметить выполнено' : record ? 'Сохранить' : initialStatus === 'PLANNED' ? 'Назначить' : 'Записать выполнение'} cancelText="Отмена" confirmLoading={loading} destroyOnHidden width={760}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="recordStatus" hidden><Input /></Form.Item>
        {lateCompletion ? (
          <Alert
            type="warning"
            showIcon
            className="form-alert"
            message="Отмечается выполнение назначения прошлых суток"
            description="Исходное назначение не переписывается. Система зафиксирует фактическое время, сотрудника и один раз проведёт исправленное количество по складу и счёту."
          />
        ) : null}
        <Form.Item name="recordType" label={recordStatus === 'PLANNED' ? 'Что назначить' : 'Что выполнено'} rules={[{ required: true, message: 'Выберите тип записи' }]}>
          <Select
            disabled={lateCompletion}
            options={recordTypeOptions.map(({ value, label }) => ({ value, label }))}
            onChange={(value: HospitalRecordType) => {
              const option = recordTypeOptions.find((item) => item.value === value);
              form.setFieldValue('title', option?.defaultTitle ?? 'Запись стационара');
            }}
          />
        </Form.Item>
        <Form.Item
          name="recordedAt"
          label={lateCompletion ? 'Когда было назначено' : recordStatus === 'PLANNED' ? 'Когда выполнить' : 'Дата и время выполнения'}
          rules={[{ required: true, message: 'Укажите дату и время' }]}
        >
          <Input type="datetime-local" disabled={lateCompletion} />
        </Form.Item>
        <Form.Item name="title" label={recordType === 'MEDICATION' ? 'Препарат или назначение' : 'Название'} rules={[{ required: true, message: 'Заполните название' }, { min: 2, message: 'Минимум 2 символа' }]}>
          <Input disabled={lateCompletion} placeholder={recordType === 'MEDICATION' ? 'Например: Цефтриаксон' : 'Краткое название записи'} />
        </Form.Item>
        {recordType === 'TEMPERATURE' ? (
          <Form.Item
            name="temperatureC"
            label="Температура, °C"
            rules={[
              { required: recordStatus === 'COMPLETED', message: 'Введите температуру' },
              {
                validator: (_, value) => {
                  if ((value === undefined || value === null || value === '') && recordStatus !== 'COMPLETED') return Promise.resolve();
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
          <Form.Item name="value" label={recordType === 'MEDICATION' ? 'Доза и способ введения' : recordStatus === 'PLANNED' ? 'Параметры назначения' : 'Результат / объём'}>
            <Input disabled={lateCompletion} placeholder={recordType === 'MEDICATION' ? 'Например: 0,5 мл внутримышечно' : 'При необходимости'} />
          </Form.Item>
        )}
        <Form.Item name="notes" label={recordStatus === 'PLANNED' ? 'Указания по выполнению' : 'Результат, реакция или комментарий'}>
          <Input.TextArea disabled={lateCompletion} rows={4} placeholder="Состояние пациента, реакция или дополнительные сведения" />
        </Form.Item>
        {recordStatus === 'PLANNED' ? (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message="Назначение не создаёт начисление и не списывает товар"
            description="Цена и склад фиксируются при записи выполненного действия, чтобы план лечения не искажал счёт и остатки."
          />
        ) : null}
        {recordStatus !== 'PLANNED' && !lateCompletion ? (
          <>
            <Typography.Title level={5}>Учёт в счёте и на складе</Typography.Title>
            <Typography.Paragraph type="secondary">
              Выбранная услуга попадёт в счёт по цене прайса. Товар попадёт в счёт и одновременно спишется с доступной партии склада.
            </Typography.Paragraph>
          </>
        ) : null}
        {completingPlannedRecord && hasPlannedCatalog ? (
          <Alert
            type="success"
            showIcon
            className="form-alert"
            message="Склад и счёт будут проведены по отметке «Выполнено»"
            description={describePlannedCatalogPosting(record)}
          />
        ) : null}
        {completingPlannedRecord && !hasPlannedCatalog && !lateCompletion ? (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message="Можно связать выполнение с товаром или услугой"
            description="Выберите товар и фактический объём, например 0,5 мл: после сохранения он один раз спишется со склада и добавится в счёт."
          />
        ) : null}
        {record && !record.billItem && !completingPlannedRecord ? (
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
        <Form.Item name="catalogKind" label="Что учесть" hidden={recordStatus === 'PLANNED' || lateCompletion}>
          <Select
            disabled={lateCompletion || catalogIdentityLocked}
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
        {recordStatus !== 'PLANNED' && !lateCompletion && catalogKind === 'PRODUCT' ? (
          <>
            <Form.Item name="productId" label="Товар из каталога" rules={[{ required: true, message: 'Выберите товар' }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={setCatalogSearch}
                loading={catalogQuery.isFetching}
                disabled={lateCompletion || catalogIdentityLocked}
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
                <InputNumber min={0.001} precision={3} disabled={lateCompletion || billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="quantity" label={`Начислить клиенту, ${selectedProductBillingUnit(selectedProductId, record, catalogQuery.data?.products)}`} rules={[{ required: true, message: 'Укажите количество начислений' }]}>
                <InputNumber min={0.001} precision={3} disabled={lateCompletion || billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="unitPrice" label={`Цена за 1 ${selectedProductBillingUnit(selectedProductId, record, catalogQuery.data?.products)}, ₽`} rules={[{ required: true, message: 'Укажите цену' }]}>
                <InputNumber min={0} precision={2} disabled={lateCompletion || billingLocked} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
        {recordStatus !== 'PLANNED' && !lateCompletion && catalogKind === 'SERVICE' ? (
          <>
            <Form.Item name="serviceId" label="Услуга из прайса" rules={[{ required: true, message: 'Выберите услугу' }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={setCatalogSearch}
                loading={catalogQuery.isFetching}
                disabled={lateCompletion || catalogIdentityLocked}
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
                <InputNumber min={0.001} precision={3} disabled={lateCompletion || billingLocked} className="full-width" />
              </Form.Item>
              <Form.Item name="unitPrice" label="Цена за одну услугу, ₽" rules={[{ required: true, message: 'Укажите цену' }]}>
                <InputNumber min={0} precision={2} disabled={lateCompletion || billingLocked} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}

function HospitalAmendmentModal({
  open,
  record,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: HospitalRecord | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: CreateHospitalAmendmentInput) => void;
}) {
  const [form] = Form.useForm<CreateHospitalAmendmentInput>();
  const recordType = Form.useWatch('recordType', form);
  const plannedCatalog = getEffectivePlannedCatalog(record);
  const plannedProduct = plannedCatalog.product;
  const plannedService = plannedCatalog.service;

  useEffect(() => {
    if (!open || !record) return;
    const currentPlannedCatalog = getEffectivePlannedCatalog(record);
    form.resetFields();
    form.setFieldsValue({
      reason: '',
      recordType: record.recordType,
      title: record.title,
      temperatureC: record.temperatureC === null ? undefined : Number(record.temperatureC),
      value: record.value ?? '',
      notes: record.notes ?? '',
      quantity: currentPlannedCatalog.productId || currentPlannedCatalog.serviceId
        ? Number(currentPlannedCatalog.quantity ?? 1)
        : undefined,
      stockQuantity: currentPlannedCatalog.productId
        ? Number(currentPlannedCatalog.stockQuantity ?? currentPlannedCatalog.quantity ?? 1)
        : undefined,
      unitPrice: currentPlannedCatalog.productId || currentPlannedCatalog.serviceId
        ? Number(currentPlannedCatalog.unitPrice ?? 0)
        : undefined,
    });
  }, [form, open, record]);

  return (
    <Modal
      title="Добавить исправление без перезаписи истории"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Добавить исправление"
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnHidden
      width={680}
    >
      <Alert
        type="warning"
        showIcon
        className="form-alert"
        message={record ? `Исходная запись от ${formatDateTime(record.recordedAt)} останется неизменной` : 'Исходная запись останется неизменной'}
        description="Исправление будет отдельным событием с причиной, автором и текущим временем."
      />
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit({
          ...values,
          temperatureC: values.temperatureC === undefined
            ? undefined
            : Math.round(Number(String(values.temperatureC).replace(',', '.')) * 10) / 10,
        })}
      >
        <Form.Item name="reason" label="Почему требуется исправление" rules={[{ required: true, message: 'Укажите причину' }, { min: 3, message: 'Минимум 3 символа' }]}>
          <Input.TextArea rows={2} placeholder="Например: уточнение после проверки врачом" />
        </Form.Item>
        <Form.Item name="recordType" label="Тип записи" rules={[{ required: true }]}>
          <Select options={recordTypeOptions.map(({ value, label }) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="title" label="Исправленный заголовок" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
        {recordType === 'TEMPERATURE' ? (
          <Form.Item name="temperatureC" label="Исправленная температура, °C" rules={[{ required: true, message: 'Введите температуру' }]}>
            <Input inputMode="decimal" />
          </Form.Item>
        ) : (
          <Form.Item name="value" label="Исправленное значение / результат"><Input /></Form.Item>
        )}
        <Form.Item name="notes" label="Исправленный комментарий"><Input.TextArea rows={4} /></Form.Item>
        {record?.recordStatus === 'PLANNED' && plannedProduct ? (
          <>
            <Typography.Title level={5}>Исправить плановое списание и начисление</Typography.Title>
            <Alert
              type="info"
              showIcon
              className="form-alert"
              message={`Товар: ${plannedProduct.title}`}
              description="Новое количество сохранится в истории исправления. Списание со склада и начисление произойдут только после отметки назначения «Выполнено»."
            />
            <div className="form-grid two-columns">
              <Form.Item
                name="stockQuantity"
                label={`Списать при выполнении, ${plannedProduct.writeOffUnit || plannedProduct.stockUnit || 'ед.'}`}
                rules={[{ required: true, message: 'Укажите количество для списания' }]}
              >
                <InputNumber min={0.001} precision={3} className="full-width" />
              </Form.Item>
              <Form.Item
                name="quantity"
                label={`Начислить клиенту, ${plannedProduct.billingUnit || plannedProduct.writeOffUnit || plannedProduct.stockUnit || 'ед.'}`}
                rules={[{ required: true, message: 'Укажите количество начислений' }]}
              >
                <InputNumber min={0.001} precision={3} className="full-width" />
              </Form.Item>
              <Form.Item
                name="unitPrice"
                label={`Цена за 1 ${plannedProduct.billingUnit || plannedProduct.writeOffUnit || plannedProduct.stockUnit || 'ед.'}, ₽`}
                rules={[{ required: true, message: 'Укажите цену' }]}
              >
                <InputNumber min={0} precision={2} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
        {record?.recordStatus === 'PLANNED' && plannedService ? (
          <>
            <Typography.Title level={5}>Исправить плановое начисление</Typography.Title>
            <Alert
              type="info"
              showIcon
              className="form-alert"
              message={`Услуга: ${plannedService.title}`}
              description="Исправление сохранится отдельно. Начисление произойдёт только после отметки назначения «Выполнено»."
            />
            <div className="form-grid two-columns">
              <Form.Item name="quantity" label="Количество услуг" rules={[{ required: true, message: 'Укажите количество' }]}>
                <InputNumber min={0.001} precision={3} className="full-width" />
              </Form.Item>
              <Form.Item name="unitPrice" label="Цена за одну услугу, ₽" rules={[{ required: true, message: 'Укажите цену' }]}>
                <InputNumber min={0} precision={2} className="full-width" />
              </Form.Item>
            </div>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}

function toDatetimeInput(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function getTreatmentReminder(records: HospitalRecord[], nowMs: number) {
  const planned = records
    .filter((record) => record.recordStatus === 'PLANNED')
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
  const due = planned.filter((record) => new Date(record.recordedAt).getTime() <= nowMs);
  const next = planned.find((record) => new Date(record.recordedAt).getTime() > nowMs) ?? null;
  return { due, next };
}

function formatTreatmentDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

function getEffectivePlannedCatalog(record: HospitalRecord | null) {
  const correction = [...(record?.amendments ?? [])]
    .reverse()
    .find((amendment) => amendment.plannedProductId
      || amendment.plannedServiceId
      || amendment.plannedQuantity !== null
      || amendment.plannedStockQuantity !== null
      || amendment.plannedUnitPrice !== null);

  return {
    productId: correction?.plannedProductId ?? record?.plannedProductId ?? null,
    serviceId: correction?.plannedServiceId ?? record?.plannedServiceId ?? null,
    quantity: correction?.plannedQuantity ?? record?.plannedQuantity ?? null,
    stockQuantity: correction?.plannedStockQuantity ?? record?.plannedStockQuantity ?? null,
    unitPrice: correction?.plannedUnitPrice ?? record?.plannedUnitPrice ?? null,
    product: correction?.plannedProduct ?? record?.plannedProduct ?? null,
    service: correction?.plannedService ?? record?.plannedService ?? null,
  };
}

function mergeProductOptions(
  record: HospitalRecord | null,
  products: HospitalCatalog['products'] | undefined,
): HospitalCatalog['products'] {
  const items = [...(products ?? [])];
  const plannedCatalog = getEffectivePlannedCatalog(record);
  const linked = record?.billItem?.product ?? plannedCatalog.product;
  if (linked && !items.some((item) => item.id === linked.id)) {
    items.unshift({
      ...linked,
      retailPrice: record?.billItem?.unitPrice ?? plannedCatalog.unitPrice ?? plannedCatalog.product?.retailPrice ?? 0,
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
  const plannedCatalog = getEffectivePlannedCatalog(record);
  const linked = record?.billItem?.service ?? plannedCatalog.service;
  if (linked && !items.some((item) => item.id === linked.id)) {
    items.unshift({ ...linked, price: record?.billItem?.unitPrice ?? plannedCatalog.unitPrice ?? plannedCatalog.service?.price ?? 0 });
  }
  return items;
}

function describePlannedCatalogPosting(record: HospitalRecord | null) {
  if (!record) return '';
  const plannedCatalog = getEffectivePlannedCatalog(record);
  if (plannedCatalog.productId) {
    const writeOffUnit = plannedCatalog.product?.writeOffUnit || plannedCatalog.product?.stockUnit || 'ед.';
    const billingUnit = plannedCatalog.product?.billingUnit || writeOffUnit;
    return `Будет списано ${plannedCatalog.stockQuantity ?? plannedCatalog.quantity ?? 1} ${writeOffUnit} и начислено ${plannedCatalog.quantity ?? 1} ${billingUnit} по ${plannedCatalog.unitPrice ?? 0} ₽.`;
  }
  if (plannedCatalog.serviceId) {
    return `В счёт будет добавлено ${plannedCatalog.quantity ?? 1} услуги по ${plannedCatalog.unitPrice ?? 0} ₽.`;
  }
  return '';
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
