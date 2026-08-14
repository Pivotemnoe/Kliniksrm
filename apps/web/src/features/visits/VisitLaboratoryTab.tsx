import { CloseOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Drawer, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { listLaboratoryTests } from '../laboratory/laboratory.api';
import { LaboratoryResultsTableDrawer } from '../laboratory/LaboratoryResultsTableDrawer';
import { printLaboratoryOrder } from '../laboratory/laboratoryPrint';
import type { OrganizationPrintProfile } from '../organization/types';
import {
  laboratoryOrderItemStatusLabels,
  laboratoryOrderStatusColors,
  laboratoryOrderStatusLabels,
  Visit,
  VisitLaboratoryItemInput,
  VisitLaboratoryOrder,
  VisitLaboratoryOrderItem,
  VisitLaboratoryOrderItemStatus,
} from './types';
import { cancelVisitLaboratoryOrder, createVisitLaboratoryOrder, updateVisitLaboratoryItem } from './visits.api';

const orderSchema = z
  .object({
    testIds: z.array(z.string()).optional(),
    comment: z.string().trim().max(1000, 'До 1000 символов').optional(),
  })
  .refine((value) => Boolean(value.testIds?.length), {
    message: 'Выберите хотя бы один анализ',
    path: ['testIds'],
  });

const resultSchema = z.object({
  status: z.enum(['ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  resultValue: z.string().trim().max(120).optional(),
  resultText: z.string().trim().max(2000).optional(),
  unit: z.string().trim().max(80).optional(),
  referenceRange: z.string().trim().max(500).optional(),
  comment: z.string().trim().max(1000).optional(),
});

type OrderFormInput = z.input<typeof orderSchema>;
type OrderFormValues = z.output<typeof orderSchema>;
type ResultFormInput = z.input<typeof resultSchema>;
type ResultFormValues = z.output<typeof resultSchema>;

export function VisitLaboratoryTab({
  visit,
  canManage,
  canPrint,
  locked,
  organization,
}: {
  visit: Visit;
  canManage: boolean;
  canPrint: boolean;
  locked: boolean;
  organization?: OrganizationPrintProfile | null;
}) {
  const queryClient = useQueryClient();
  const [orderOpen, setOrderOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ order: VisitLaboratoryOrder; item: VisitLaboratoryOrderItem } | null>(null);
  const [tableOrder, setTableOrder] = useState<VisitLaboratoryOrder | null>(null);
  const visitCancelled = visit.status === 'CANCELLED';
  const disabled = locked || !canManage || visitCancelled;
  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelVisitLaboratoryOrder(visit.id, orderId),
    onSuccess: async () => invalidateVisit(queryClient, visit.id),
  });
  const itemColumns: ColumnsType<VisitLaboratoryOrderItem> = [
    {
      title: 'Анализ',
      dataIndex: 'title',
      key: 'title',
      render: (value, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          {item.code || item.groupName ? (
            <Typography.Text type="secondary">{[item.code, item.groupName].filter(Boolean).join(' · ')}</Typography.Text>
          ) : null}
          {item.profile ? <Tag>{item.profile.title}</Tag> : null}
        </Space>
      ),
    },
    { title: 'Результат', key: 'result', render: (_, item) => item.resultValue || item.resultText || '—' },
    { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 90, render: fallback },
    { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 150, render: fallback },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: VisitLaboratoryOrderItemStatus) => <Tag>{laboratoryOrderItemStatusLabels[value]}</Tag>,
    },
    { title: 'Счёт', key: 'bill', width: 140, render: (_, item) => (item.billItem ? formatMoney(item.billItem.totalAmount) : '—') },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, item, index) =>
        disabled ? null : (
          <Button
            icon={<EditOutlined />}
            onClick={() => setEditingItem(findOrderItem(visit.laboratoryOrders, item.id) ?? null)}
            aria-label={`Открыть результат ${index + 1}`}
          />
        ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="full-width">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." /> : null}
      {visitCancelled ? (
        <Alert type="warning" showIcon message="Лаборатория отменённого приёма защищена. Директор должен сначала нажать «Вернуть в работу» и указать причину." />
      ) : null}
      {cancelMutation.isError ? <Alert type="error" showIcon message={getErrorMessage(cancelMutation.error)} /> : null}
      <div className="toolbar-row">
        <Space direction="vertical" size={0}>
          <Typography.Text type="secondary">Лабораторные назначения и результаты в рамках приёма.</Typography.Text>
          <Typography.Text type="secondary">Связанные услуги автоматически попадают в счёт приёма.</Typography.Text>
        </Space>
        {!disabled ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOrderOpen(true)}>
            Назначить анализы
          </Button>
        ) : null}
      </div>
      {visit.laboratoryOrders.length ? (
        visit.laboratoryOrders.map((order) => (
          <Card
            key={order.id}
            size="small"
            title={
              <Space wrap>
                <ExperimentOutlined />
                <span>Заказ от {formatDateTime(order.createdAt)}</span>
                <Tag color={laboratoryOrderStatusColors[order.status]}>{laboratoryOrderStatusLabels[order.status]}</Tag>
              </Space>
            }
            extra={
              <Space wrap>
                {canPrint ? (
                  <Button size="small" icon={<PrinterOutlined />} onClick={() => printLaboratoryOrder(toPrintOrder(visit, order), organization)}>
                    Печать A5
                  </Button>
                ) : null}
                {order.status !== 'CANCELLED' ? (
                  <Button size="small" icon={<EditOutlined />} disabled={disabled} onClick={() => setTableOrder(order)}>
                    Заполнить показатели
                  </Button>
                ) : null}
                {!disabled && order.status !== 'CANCELLED' ? (
                  <Popconfirm title="Отменить лабораторный заказ?" okText="Отменить" cancelText="Закрыть" onConfirm={() => cancelMutation.mutate(order.id)}>
                    <Button danger size="small" icon={<CloseOutlined />} loading={cancelMutation.isPending}>
                      Отменить
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            }
          >
            {order.comment ? <Typography.Paragraph>{order.comment}</Typography.Paragraph> : null}
            <Table<VisitLaboratoryOrderItem>
              rowKey="id"
              columns={itemColumns}
              dataSource={order.items}
              pagination={false}
              className="dense-table"
              scroll={{ x: 980 }}
            />
          </Card>
        ))
      ) : (
        <Alert type="info" showIcon message="Лабораторные анализы ещё не назначались." />
      )}
      <OrderDrawer open={orderOpen} visit={visit} onClose={() => setOrderOpen(false)} />
      <LaboratoryResultsTableDrawer
        order={tableOrder}
        patientName={visit.animal.nickname}
        canManage={!disabled}
        onClose={() => setTableOrder(null)}
      />
      <ResultDrawer visit={visit} target={editingItem} onClose={() => setEditingItem(null)} />
    </Space>
  );
}

function OrderDrawer({ open, visit, onClose }: { open: boolean; visit: Visit; onClose: () => void }) {
  const queryClient = useQueryClient();
  const testsQuery = useQuery({ queryKey: ['laboratory', 'tests', 'visit-select'], queryFn: () => listLaboratoryTests({ limit: 300, offset: 0, isActive: true }) });
  const form = useForm<OrderFormInput, unknown, OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { testIds: [], comment: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: OrderFormValues) => createVisitLaboratoryOrder(visit.id, values),
    onSuccess: async () => {
      await invalidateVisit(queryClient, visit.id);
      form.reset({ testIds: [], comment: '' });
      onClose();
    },
  });

  return (
    <Drawer title="Назначить анализы" open={open} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        {mutation.error ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
        <Alert
          type="info"
          showIcon
          className="form-alert"
          message="Каждый анализ уже связан с услугой и готовым документом"
          description="Выберите нужный анализ. CRM один раз начислит связанную услугу, а для результатов откроет таблицу именно из привязанного документа."
        />
        <Controller
          control={form.control}
          name="testIds"
          render={({ field, fieldState }) => (
            <Form.Item label="Лабораторные анализы" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Select
                {...field}
                mode="multiple"
                showSearch
                optionFilterProp="label"
                placeholder="Выберите анализы"
                options={testsQuery.data?.items
                  .filter((test) => test.serviceId && test.documentTemplateId)
                  .map((test) => ({
                    value: test.id,
                    label: `${test.title}${test.code ? ` · ${test.code}` : ''} · ${test.service?.title ?? 'услуга'} · ${test.documentTemplate?.title ?? 'документ'}`,
                  })) ?? []}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={form.control}
          name="comment"
          render={({ field }) => (
            <Form.Item label="Комментарий">
              <Input.TextArea {...field} rows={3} />
            </Form.Item>
          )}
        />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Назначить
        </Button>
      </Form>
    </Drawer>
  );
}

function ResultDrawer({
  visit,
  target,
  onClose,
}: {
  visit: Visit;
  target: { order: VisitLaboratoryOrder; item: VisitLaboratoryOrderItem } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ResultFormInput, unknown, ResultFormValues>({
    resolver: zodResolver(resultSchema),
    defaultValues: getResultDefaults(null),
  });
  const mutation = useMutation({
    mutationFn: (values: VisitLaboratoryItemInput) => updateVisitLaboratoryItem(visit.id, target!.order.id, target!.item.id, values),
    onSuccess: async () => {
      await invalidateVisit(queryClient, visit.id);
      onClose();
    },
  });

  useEffect(() => {
    form.reset(getResultDefaults(target?.item ?? null));
  }, [form, target]);

  return (
    <Drawer title={target?.item.title ?? 'Результат анализа'} open={Boolean(target)} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        {mutation.error ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Form.Item label="Статус">
              <Select {...field} options={Object.entries(laboratoryOrderItemStatusLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
        />
        <Controller control={form.control} name="resultValue" render={({ field }) => <Form.Item label="Значение"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="unit" render={({ field }) => <Form.Item label="Единица"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="referenceRange" render={({ field }) => <Form.Item label="Референс"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="resultText" render={({ field }) => <Form.Item label="Текст результата"><Input.TextArea {...field} rows={4} /></Form.Item>} />
        <Controller control={form.control} name="comment" render={({ field }) => <Form.Item label="Комментарий"><Input.TextArea {...field} rows={3} /></Form.Item>} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить результат
        </Button>
      </Form>
    </Drawer>
  );
}

function findOrderItem(orders: VisitLaboratoryOrder[], itemId: string) {
  for (const order of orders) {
    const item = order.items.find((candidate) => candidate.id === itemId);
    if (item) {
      return { order, item };
    }
  }

  return null;
}

function getResultDefaults(item: VisitLaboratoryOrderItem | null): ResultFormInput {
  return {
    status: item?.status ?? 'ORDERED',
    resultValue: item?.resultValue ?? '',
    resultText: item?.resultText ?? '',
    unit: item?.unit ?? '',
    referenceRange: item?.referenceRange ?? '',
    comment: item?.comment ?? '',
  };
}

function fallback(value?: string | null) {
  return value || '—';
}

function toPrintOrder(visit: Visit, order: VisitLaboratoryOrder) {
  return {
    ...order,
    visit: {
      owner: {
        fullName: visit.owner.fullName,
        phone: visit.owner.phone,
      },
      animal: {
        nickname: visit.animal.nickname,
        species: visit.animal.species,
        breed: visit.animal.breed,
      },
      employee: visit.employee ? { fullName: visit.employee.fullName } : null,
    },
  };
}

async function invalidateVisit(queryClient: QueryClient, visitId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['visits', visitId] }),
    queryClient.invalidateQueries({ queryKey: ['visits'] }),
  ]);
}
