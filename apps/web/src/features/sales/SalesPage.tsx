import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { listProducts, listServices } from '../stock/stock.api';
import { paymentStatusColors, paymentStatusLabels } from '../billing/types';
import { createSale, listSales } from './sales.api';
import { CreateSaleInput, SaleListItem } from './types';

const pageSize = 10;

export function SalesPage() {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'billing.manage');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const dateBounds = getSalesDateBounds(dateFrom, dateTo);
  const salesQuery = useQuery({
    queryKey: ['sales', { search, dateFrom, dateTo, limit: pageSize, offset }],
    queryFn: () => listSales({ search, ...dateBounds, limit: pageSize, offset }),
  });

  const columns = useMemo<ColumnsType<SaleListItem>>(
    () => [
      {
        title: 'Продажа',
        key: 'sale',
        render: (_, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/sales/${record.id}`)}>
            {record.id.slice(0, 8)}
          </Button>
        ),
      },
      {
        title: 'Статус счёта',
        key: 'billStatus',
        render: (_, record) =>
          record.bill ? (
            <Tag color={paymentStatusColors[record.bill.status]}>{paymentStatusLabels[record.bill.status]}</Tag>
          ) : (
            <Tag>Нет счёта</Tag>
          ),
      },
      {
        title: 'Владелец',
        key: 'owner',
        render: (_, record) =>
          record.owner ? (
            <Typography.Link onClick={() => navigate(`/owners/${record.owner?.id}`)}>{record.owner.fullName}</Typography.Link>
          ) : (
            'Розничный покупатель'
          ),
      },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, record) =>
          record.animal ? (
            <Typography.Link onClick={() => navigate(`/patients/${record.animal?.id}`)}>{record.animal.nickname}</Typography.Link>
          ) : (
            '—'
          ),
      },
      { title: 'Позиций', key: 'items', render: (_, record) => record._count?.items ?? 0 },
      { title: 'Создана', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Оплачено',
        key: 'paid',
        render: (_, record) => (record.bill ? formatMoney(record.bill.paidAmount) : '—'),
      },
      {
        title: '',
        key: 'actions',
        width: 180,
        render: (_, record) => (
          <Space wrap>
            <Button size="small" onClick={() => navigate(`/sales/${record.id}`)}>
              Открыть
            </Button>
            {record.bill ? (
              <Button size="small" onClick={() => navigate(`/bills/${record.bill?.id}`)}>
                Счёт
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Продажи"
        description="Отдельные продажи товаров и услуг без клинического приёма."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Новая продажа
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по покупателю, телефону, пациенту или позиции"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
              setOffset(0);
            }}
          />
          <Space wrap>
            <Space size={6}>
              <Typography.Text type="secondary">С</Typography.Text>
              <Input
                type="date"
                className="date-filter"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setOffset(0);
                }}
              />
            </Space>
            <Space size={6}>
              <Typography.Text type="secondary">По</Typography.Text>
              <Input
                type="date"
                className="date-filter"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setOffset(0);
                }}
              />
            </Space>
            {dateFrom || dateTo ? (
              <Button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setOffset(0);
                }}
              >
                Сбросить даты
              </Button>
            ) : null}
          </Space>
        </div>
        <div className="list-panel-body">
          <Space direction="vertical" size={16} className="full-width">
            {salesQuery.isError ? <Typography.Text type="danger">{getErrorMessage(salesQuery.error)}</Typography.Text> : null}
            <Table<SaleListItem>
              rowKey="id"
              className="dense-table"
              columns={columns}
              dataSource={salesQuery.data?.items ?? []}
              loading={salesQuery.isLoading}
              pagination={{ current: offset / pageSize + 1, pageSize, total: salesQuery.data?.total ?? 0, showSizeChanger: false }}
              onChange={handleTableChange}
              onRow={(record) => ({ onDoubleClick: () => navigate(`/sales/${record.id}`) })}
            />
          </Space>
        </div>
      </div>
      <SaleCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function getSalesDateBounds(dateFrom: string, dateTo: string) {
  return {
    ...(dateFrom ? { dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString() } : {}),
    ...(dateTo ? { dateTo: new Date(`${dateTo}T23:59:59.999`).toISOString() } : {}),
  };
}

type SaleLineForm = {
  id: string;
  lineType: 'PRODUCT' | 'SERVICE' | 'MANUAL';
  productId?: string;
  serviceId?: string;
  title?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

const saleLineSchema = z
  .object({
    lineType: z.enum(['PRODUCT', 'SERVICE', 'MANUAL']),
    productId: z.string().optional(),
    serviceId: z.string().optional(),
    title: z.string().trim().optional(),
    quantity: z.number().min(0.001),
    unitPrice: z.number().min(0),
    discount: z.number().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.lineType === 'PRODUCT' && !value.productId) {
      ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Выберите товар' });
    }

    if (value.lineType === 'SERVICE' && !value.serviceId) {
      ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'Выберите услугу' });
    }

    if (value.lineType === 'MANUAL' && !value.title?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Введите название' });
    }
  });

function SaleCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const [animalId, setAnimalId] = useState<string | undefined>();
  const [lines, setLines] = useState<SaleLineForm[]>([createEmptyLine()]);
  const ownersQuery = useQuery({
    queryKey: ['owners', 'sale-select', ownerSearch],
    queryFn: () => listOwners({ search: ownerSearch, limit: 30, offset: 0 }),
    enabled: open,
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals', 'sale-select'],
    queryFn: () => listOwnerAnimals(ownerId!),
    enabled: open && Boolean(ownerId),
  });
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'sale-select'],
    queryFn: () => listProducts({ limit: 100, offset: 0 }),
    enabled: open,
  });
  const servicesQuery = useQuery({
    queryKey: ['stock', 'services', 'sale-select'],
    queryFn: () => listServices({ limit: 100, offset: 0 }),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: (input: CreateSaleInput) => createSale(input),
    onSuccess: async (sale) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
      ]);
      message.success('Продажа создана');
      resetForm();
      onClose();
      if (sale.bill?.id) {
        navigate(`/bills/${sale.bill.id}`);
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const total = lines.reduce((sum, line) => sum + Math.max(line.quantity * line.unitPrice - line.discount, 0), 0);

  function resetForm() {
    setOwnerSearch('');
    setOwnerId(undefined);
    setAnimalId(undefined);
    setLines([createEmptyLine()]);
  }

  function updateLine(id: string, patch: Partial<SaleLineForm>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function submit() {
    const parsedLines = z.array(saleLineSchema).safeParse(lines.map(({ id, ...line }) => line));

    if (!parsedLines.success) {
      message.error(parsedLines.error.issues[0]?.message ?? 'Проверьте позиции продажи');
      return;
    }

    mutation.mutate({
      ownerId,
      animalId,
      items: parsedLines.data.map((line) => ({
        productId: line.lineType === 'PRODUCT' ? line.productId : undefined,
        serviceId: line.lineType === 'SERVICE' ? line.serviceId : undefined,
        title: line.title,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
      })),
    });
  }

  return (
    <Modal
      title="Новая продажа"
      open={open}
      okText="Создать продажу"
      cancelText="Отмена"
      confirmLoading={mutation.isPending}
      onCancel={onClose}
      onOk={submit}
      width={940}
      destroyOnHidden
    >
      <Form layout="vertical">
        <div className="form-grid two-columns">
          <Form.Item label="Покупатель">
            <Select
              allowClear
              showSearch
              filterOption={false}
              loading={ownersQuery.isLoading}
              value={ownerId}
              onSearch={setOwnerSearch}
              onChange={(value) => {
                setOwnerId(value);
                setAnimalId(undefined);
              }}
              placeholder="Можно оставить розничного покупателя"
              options={ownersQuery.data?.items.map((owner) => ({ value: owner.id, label: owner.phone ? `${owner.fullName} · ${owner.phone}` : owner.fullName })) ?? []}
            />
          </Form.Item>
          <Form.Item label="Пациент">
            <Select
              allowClear
              loading={animalsQuery.isLoading}
              disabled={!ownerId}
              value={animalId}
              onChange={setAnimalId}
              placeholder={ownerId ? 'Выберите пациента при необходимости' : 'Сначала выберите владельца'}
              options={animalsQuery.data?.map((animal) => ({ value: animal.id, label: animal.nickname })) ?? []}
            />
          </Form.Item>
        </div>
        <Space direction="vertical" size={10} className="full-width">
          {lines.map((line, index) => (
            <div className="sale-line" key={line.id}>
              <Select
                value={line.lineType}
                onChange={(value) =>
                  updateLine(line.id, {
                    lineType: value,
                    productId: undefined,
                    serviceId: undefined,
                    title: '',
                    unitPrice: 0,
                  })
                }
                options={[
                  { value: 'PRODUCT', label: 'Товар' },
                  { value: 'SERVICE', label: 'Услуга' },
                  { value: 'MANUAL', label: 'Ручная' },
                ]}
              />
              {line.lineType === 'PRODUCT' ? (
                <Select
                  showSearch
                  loading={productsQuery.isLoading}
                  value={line.productId}
                  placeholder="Товар"
                  options={productsQuery.data?.items.map((product) => ({ value: product.id, label: product.title })) ?? []}
                  onChange={(value) => {
                    const product = productsQuery.data?.items.find((item) => item.id === value);
                    updateLine(line.id, { productId: value, title: product?.title ?? '', unitPrice: toMoneyNumber(product?.retailPrice) });
                  }}
                />
              ) : null}
              {line.lineType === 'SERVICE' ? (
                <Select
                  showSearch
                  loading={servicesQuery.isLoading}
                  value={line.serviceId}
                  placeholder="Услуга"
                  options={servicesQuery.data?.items.map((service) => ({ value: service.id, label: service.title })) ?? []}
                  onChange={(value) => {
                    const service = servicesQuery.data?.items.find((item) => item.id === value);
                    updateLine(line.id, { serviceId: value, title: service?.title ?? '', unitPrice: toMoneyNumber(service?.price) });
                  }}
                />
              ) : null}
              {line.lineType === 'MANUAL' ? (
                <Input value={line.title} placeholder="Название" onChange={(event) => updateLine(line.id, { title: event.target.value })} />
              ) : null}
              <InputNumber min={0.001} step={0.01} value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value ?? 1 })} />
              <InputNumber min={0} value={line.unitPrice} onChange={(value) => updateLine(line.id, { unitPrice: value ?? 0 })} />
              <InputNumber min={0} value={line.discount} onChange={(value) => updateLine(line.id, { discount: value ?? 0 })} />
              <Typography.Text strong>{formatMoney(Math.max(line.quantity * line.unitPrice - line.discount, 0))}</Typography.Text>
              <Popconfirm
                title="Удалить позицию?"
                okText="Удалить"
                cancelText="Отмена"
                disabled={lines.length <= 1}
                onConfirm={() => setLines((current) => current.filter((item) => item.id !== line.id))}
              >
                <Button danger disabled={lines.length <= 1}>
                  Удалить
                </Button>
              </Popconfirm>
              {index === 0 ? <span className="sale-line-head">Количество</span> : null}
            </div>
          ))}
        </Space>
        <div className="toolbar-row sale-total-row">
          <Button icon={<PlusOutlined />} onClick={() => setLines((current) => [...current, createEmptyLine()])}>
            Добавить позицию
          </Button>
          <Typography.Title level={4}>Итого {formatMoney(total)}</Typography.Title>
        </div>
        <Typography.Text type="secondary">
          После создания откроется счёт продажи, где можно принять оплату или провести частичную оплату.
        </Typography.Text>
      </Form>
    </Modal>
  );
}

function createEmptyLine(): SaleLineForm {
  return {
    id: crypto.randomUUID(),
    lineType: 'PRODUCT',
    quantity: 1,
    unitPrice: 0,
    discount: 0,
  };
}
