import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { listProducts, listServices } from '../stock/stock.api';
import { Visit, VisitBillItem, VisitServiceLineInput } from './types';
import { addVisitService, deleteVisitService, updateVisitService } from './visits.api';

const serviceLineSchema = z.object({
  lineType: z.enum(['PRODUCT', 'SERVICE', 'MANUAL']),
  productId: z.string().optional(),
  serviceId: z.string().optional(),
  title: z.string().trim().min(1, 'Введите услугу').max(500),
  quantity: requiredNumber(0.001, 999999),
  unitPrice: requiredNumber(0, 999999999),
  discount: requiredNumber(0, 999999999),
}).superRefine((value, context) => {
  if (value.lineType === 'PRODUCT' && !value.productId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'Выберите товар' });
  }

  if (value.lineType === 'SERVICE' && !value.serviceId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceId'], message: 'Выберите услугу' });
  }
});

type ServiceLineValues = z.infer<typeof serviceLineSchema>;
type ServiceLineFormInput = z.input<typeof serviceLineSchema>;

type VisitServicesTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
};

export function VisitServicesTab({ visit, canManage, locked }: VisitServicesTabProps) {
  const queryClient = useQueryClient();
  const [editingLine, setEditingLine] = useState<VisitBillItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const disabled = locked || !canManage;
  const items = visit.bill?.items ?? [];
  const saveMutation = useMutation({
    mutationFn: (values: VisitServiceLineInput) =>
      editingLine ? updateVisitService(visit.id, editingLine.id, values) : addVisitService(visit.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      setDrawerOpen(false);
      setEditingLine(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (billItemId: string) => deleteVisitService(visit.id, billItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  const columns = useMemo<ColumnsType<VisitBillItem>>(
    () => [
      { title: 'Услуга', dataIndex: 'title', key: 'title' },
      {
        title: 'Тип',
        key: 'type',
        width: 120,
        render: (_, record) => record.productId ? <Tag color="green">Товар</Tag> : record.serviceId ? <Tag color="blue">Услуга</Tag> : <Tag>Ручная</Tag>,
      },
      { title: 'Кол-во', dataIndex: 'quantity', key: 'quantity', render: (value) => Number(value).toLocaleString('ru-RU') },
      { title: 'Цена', dataIndex: 'unitPrice', key: 'unitPrice', render: formatMoney },
      { title: 'Скидка', dataIndex: 'discount', key: 'discount', render: formatMoney },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Склад',
        key: 'stock',
        render: (_, record) =>
          record.productId ? (
            <Typography.Text type={record.stockMovements?.length ? 'secondary' : 'danger'}>
              {record.stockMovements?.length ? 'Списано' : 'Нет движения'}
            </Typography.Text>
          ) : (
            '—'
          ),
      },
      {
        title: '',
        key: 'actions',
        width: 150,
        render: (_, record) =>
          disabled ? null : (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingLine(record);
                  setDrawerOpen(true);
                }}
              />
              <Popconfirm title="Удалить услугу?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteMutation.mutate(record.id)}>
                <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            </Space>
          ),
      },
    ],
    [deleteMutation, disabled],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." /> : null}
      {saveMutation.isError ? <Typography.Text type="danger">{getErrorMessage(saveMutation.error)}</Typography.Text> : null}
      {deleteMutation.isError ? <Typography.Text type="danger">{getErrorMessage(deleteMutation.error)}</Typography.Text> : null}
      <div className="toolbar-row">
        <Space size={24} wrap>
          <Typography.Text type="secondary">Товары и услуги приёма</Typography.Text>
          <Statistic title="Сумма приёма" value={toMoneyNumber(visit.totalAmount)} precision={2} suffix="₽" />
        </Space>
        {!disabled ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingLine(null);
              setDrawerOpen(true);
            }}
          >
            Добавить позицию
          </Button>
        ) : null}
      </div>
      <Table<VisitBillItem> rowKey="id" columns={columns} dataSource={items} pagination={false} />
      <ServiceLineDrawer
        open={drawerOpen}
        line={editingLine}
        isSubmitting={saveMutation.isPending}
        submitError={saveMutation.error}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </Space>
  );
}

function ServiceLineDrawer({
  open,
  line,
  isSubmitting,
  submitError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  line: VisitBillItem | null;
  isSubmitting?: boolean;
  submitError?: unknown;
  onClose: () => void;
  onSubmit: (values: VisitServiceLineInput) => void;
}) {
  const { control, handleSubmit, reset } = useForm<ServiceLineFormInput, unknown, ServiceLineValues>({
    resolver: zodResolver(serviceLineSchema),
    defaultValues: getDefaultValues(line),
  });
  const isEdit = Boolean(line);
  const lineType = useWatch({ control, name: 'lineType' });
  const quantity = useWatch({ control, name: 'quantity' });
  const unitPrice = useWatch({ control, name: 'unitPrice' });
  const discount = useWatch({ control, name: 'discount' });
  const calculatedTotal = Math.max(toMoneyNumber(quantity) * toMoneyNumber(unitPrice) - toMoneyNumber(discount), 0);
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'visit-line-select'],
    queryFn: () => listProducts({ limit: 100, offset: 0 }),
    enabled: open && !isEdit,
  });
  const servicesQuery = useQuery({
    queryKey: ['stock', 'services', 'visit-line-select'],
    queryFn: () => listServices({ limit: 100, offset: 0 }),
    enabled: open && !isEdit,
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(line));
    }
  }

  function submit(values: ServiceLineValues) {
    onSubmit({
      ...(!line && values.lineType === 'PRODUCT' ? { productId: values.productId } : {}),
      ...(!line && values.lineType === 'SERVICE' ? { serviceId: values.serviceId } : {}),
      title: values.title,
      quantity: values.quantity,
      unitPrice: values.unitPrice,
      discount: values.discount,
    });
  }

  return (
    <Drawer
      title={line ? 'Редактировать позицию' : 'Добавить позицию'}
      width={560}
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
        {productsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(productsQuery.error)} className="form-alert" /> : null}
        {servicesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(servicesQuery.error)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="lineType"
          render={({ field }) => (
            <Form.Item label="Тип позиции">
              <Select
                {...field}
                disabled={isEdit}
                options={[
                  { value: 'SERVICE', label: 'Услуга' },
                  { value: 'PRODUCT', label: 'Товар' },
                  { value: 'MANUAL', label: 'Ручная строка' },
                ]}
              />
            </Form.Item>
          )}
        />
        {lineType === 'PRODUCT' ? (
          <Controller
            control={control}
            name="productId"
            render={({ field, fieldState }) => (
              <Form.Item label="Товар" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  disabled={isEdit}
                  loading={productsQuery.isLoading}
                  options={productsQuery.data?.items.map((product) => ({ value: product.id, label: product.title })) ?? []}
                  placeholder="Выберите товар"
                  onChange={(value) => {
                    field.onChange(value);
                    const product = productsQuery.data?.items.find((item) => item.id === value);
                    if (product) {
                      reset({
                        ...getDefaultValues(line),
                        lineType: 'PRODUCT',
                        productId: product.id,
                        title: product.title,
                        unitPrice: String(product.retailPrice),
                        quantity: quantity || '1',
                        discount: discount || '0',
                      });
                    }
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {lineType === 'SERVICE' ? (
          <Controller
            control={control}
            name="serviceId"
            render={({ field, fieldState }) => (
              <Form.Item label="Услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  showSearch
                  disabled={isEdit}
                  loading={servicesQuery.isLoading}
                  options={servicesQuery.data?.items.map((service) => ({ value: service.id, label: service.title })) ?? []}
                  placeholder="Выберите услугу"
                  onChange={(value) => {
                    field.onChange(value);
                    const service = servicesQuery.data?.items.find((item) => item.id === value);
                    if (service) {
                      reset({
                        ...getDefaultValues(line),
                        lineType: 'SERVICE',
                        serviceId: service.id,
                        title: service.title,
                        unitPrice: String(service.price),
                        quantity: quantity || '1',
                        discount: discount || '0',
                      });
                    }
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <Form.Item label="Услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="quantity"
            render={({ field, fieldState }) => (
              <Form.Item label="Количество" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" placeholder="Например 0,1 или 0,01" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="unitPrice"
            render={({ field, fieldState }) => (
              <Form.Item label="Цена" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="discount"
            render={({ field, fieldState }) => (
              <Form.Item label="Скидка" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
          <Form.Item label="Сумма строки">
            <Input value={formatMoney(calculatedTotal)} readOnly />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}

function getDefaultValues(line: VisitBillItem | null): ServiceLineFormInput {
  return {
    lineType: line?.productId ? 'PRODUCT' : line?.serviceId ? 'SERVICE' : 'MANUAL',
    productId: line?.productId ?? undefined,
    serviceId: line?.serviceId ?? undefined,
    title: line?.title ?? '',
    quantity: line ? String(line.quantity) : '1',
    unitPrice: line ? String(line.unitPrice) : '0',
    discount: line ? String(line.discount) : '0',
  };
}

function requiredNumber(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      const parsed = Number(value.replace(',', '.'));

      if (!value || !Number.isFinite(parsed) || parsed < min || parsed > max) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Введите число от ${min} до ${max}` });
        return z.NEVER;
      }

      return parsed;
    });
}
