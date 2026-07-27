import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import {
  cancelHospitalStay,
  createHospitalRecord,
  dischargeHospitalStay,
  getHospitalResources,
  getHospitalStay,
  updateHospitalStay,
} from './hospital.api';
import type { CreateHospitalRecordInput, HospitalRecord, HospitalRecordType } from './types';

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
  const { visitId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'hospital.manage');
  const [recordOpen, setRecordOpen] = useState(false);
  const [boxId, setBoxId] = useState<string>();
  const stayQuery = useQuery({
    queryKey: ['hospital', visitId],
    queryFn: () => getHospitalStay(visitId),
    enabled: Boolean(visitId),
  });
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources });
  const stay = stayQuery.data;
  const active = stay ? ['DRAFT', 'IN_PROGRESS'].includes(stay.status) : false;

  useEffect(() => {
    setBoxId(stay?.hospitalBoxId ?? undefined);
  }, [stay?.hospitalBoxId]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hospital', visitId] }),
      queryClient.invalidateQueries({ queryKey: ['hospital'] }),
      queryClient.invalidateQueries({ queryKey: ['visits', visitId] }),
      queryClient.invalidateQueries({ queryKey: ['visits'] }),
    ]);
  }

  const transferMutation = useMutation({
    mutationFn: (nextBoxId: string) => updateHospitalStay(visitId, { hospitalBoxId: nextBoxId }),
    onSuccess: async () => { await refresh(); message.success('Пациент переведён в другой бокс'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'discharge' | 'cancel') =>
      action === 'discharge' ? dischargeHospitalStay(visitId) : cancelHospitalStay(visitId),
    onSuccess: async (_, action) => {
      await refresh();
      message.success(action === 'discharge' ? 'Пациент выписан из стационара' : 'Госпитализация отменена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const recordMutation = useMutation({
    mutationFn: (input: CreateHospitalRecordInput) => createHospitalRecord(visitId, input),
    onSuccess: async () => {
      await refresh();
      setRecordOpen(false);
      message.success('Запись добавлена в карту стационара');
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
          {record.temperatureC ? <Typography.Text>{record.temperatureC} °C</Typography.Text> : null}
          {record.value ? <Typography.Text>{record.value}</Typography.Text> : null}
          {record.notes ? <Typography.Text type="secondary">{record.notes}</Typography.Text> : null}
        </Space>
      ),
    },
    { title: 'Выполнил', key: 'employee', width: 220, render: (_, record) => record.recordedBy?.fullName ?? 'Сотрудник не указан' },
  ], []);

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
            {stay ? <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits/${stay.id}`)}>Осмотр при поступлении</Button> : null}
            {canManage && active ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecordOpen(true)}>Добавить запись</Button> : null}
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
                <Descriptions.Item label="Статус"><Tag color={visitStatusColors[stay.status]}>{visitStatusLabels[stay.status]}</Tag></Descriptions.Item>
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
              {canManage && active ? <Button icon={<PlusOutlined />} onClick={() => setRecordOpen(true)}>Добавить запись</Button> : null}
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
        loading={recordMutation.isPending}
        onClose={() => setRecordOpen(false)}
        onSubmit={(values) => recordMutation.mutate({
          ...values,
          recordedAt: values.recordedAt ? new Date(values.recordedAt).toISOString() : undefined,
        })}
      />
    </div>
  );
}

function HospitalRecordModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (values: CreateHospitalRecordInput) => void }) {
  const [form] = Form.useForm<CreateHospitalRecordInput>();
  const recordType = Form.useWatch('recordType', form);

  return (
    <Modal title="Новая запись стационара" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={loading} destroyOnHidden afterOpenChange={(nextOpen) => nextOpen && form.setFieldsValue({ recordType: 'OBSERVATION', title: 'Состояние пациента', recordedAt: toDatetimeInput(new Date()), value: '', notes: '', temperatureC: undefined })}>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
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
          <Form.Item name="temperatureC" label="Температура, °C" rules={[{ required: true, message: 'Введите температуру' }]}>
            <InputNumber min={30} max={45} step={0.1} precision={1} className="full-width" />
          </Form.Item>
        ) : (
          <Form.Item name="value" label={recordType === 'MEDICATION' ? 'Доза и способ введения' : 'Результат / объём'}>
            <Input placeholder={recordType === 'MEDICATION' ? 'Например: 0,5 мл внутримышечно' : 'При необходимости'} />
          </Form.Item>
        )}
        <Form.Item name="notes" label="Комментарий">
          <Input.TextArea rows={4} placeholder="Состояние пациента, реакция или дополнительные сведения" />
        </Form.Item>
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
