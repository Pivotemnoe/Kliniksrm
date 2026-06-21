import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { paymentStatusColors, paymentStatusLabels } from '../billing/types';
import { getSale } from './sales.api';
import { SaleItem, SaleStockMovement } from './types';

export function SaleCardPage() {
  const { saleId = '' } = useParams();
  const navigate = useNavigate();
  const saleQuery = useQuery({
    queryKey: ['sales', saleId],
    queryFn: () => getSale(saleId),
    enabled: Boolean(saleId),
  });
  const sale = saleQuery.data;
  const itemColumns = useMemo<ColumnsType<SaleItem>>(
    () => [
      { title: 'Позиция', dataIndex: 'title', key: 'title' },
      { title: 'Тип', key: 'type', width: 120, render: (_, item) => (item.productId ? 'Товар' : item.serviceId ? 'Услуга' : 'Ручная') },
      { title: 'Количество', dataIndex: 'quantity', key: 'quantity', width: 120 },
      { title: 'Цена', dataIndex: 'unitPrice', key: 'unitPrice', width: 130, render: formatMoney },
      { title: 'Скидка', dataIndex: 'discount', key: 'discount', width: 130, render: formatMoney },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: formatMoney },
    ],
    [],
  );
  const movementColumns = useMemo<ColumnsType<SaleStockMovement>>(
    () => [
      { title: 'Товар', key: 'product', render: (_, item) => item.product?.title ?? '—' },
      { title: 'Склад', key: 'warehouse', width: 160, render: (_, item) => item.warehouse?.name ?? '—' },
      { title: 'Партия', key: 'batch', width: 160, render: (_, item) => item.stockBatch?.series ?? item.stockBatch?.id.slice(0, 8) ?? '—' },
      { title: 'Срок годности', key: 'expiresAt', width: 140, render: (_, item) => formatDate(item.stockBatch?.expiresAt) },
      { title: 'Количество', key: 'quantity', width: 130, render: (_, item) => `${item.quantity} ${item.product?.stockUnit ?? ''}`.trim() },
      { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
    ],
    [],
  );

  return (
    <div className="page">
      <PageHeader
        title={sale ? `Продажа ${sale.id.slice(0, 8)}` : 'Продажа'}
        description="Карточка продажи, позиции, связанный счёт и складские списания."
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales')}>
              К списку
            </Button>
            {sale?.bill ? (
              <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate(`/bills/${sale.bill?.id}`)}>
                Открыть счёт
              </Button>
            ) : null}
          </Space>
        }
      />
      {saleQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(saleQuery.error)} className="form-alert" /> : null}
      <Space direction="vertical" size={16} className="full-width">
        <div className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4} className="compact-title">Основное</Typography.Title>
            {sale?.bill ? <Tag color={paymentStatusColors[sale.bill.status]}>{paymentStatusLabels[sale.bill.status]}</Tag> : <Tag>Нет счёта</Tag>}
          </div>
          <div className="list-panel-body">
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Дата">{formatDateTime(sale?.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Сумма">{formatMoney(sale?.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Владелец">
                {sale?.owner ? <Typography.Link onClick={() => navigate(`/owners/${sale.owner?.id}`)}>{sale.owner.fullName}</Typography.Link> : 'Розничный покупатель'}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">{sale?.owner?.phone ?? sale?.owner?.extraPhone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Пациент">
                {sale?.animal ? <Typography.Link onClick={() => navigate(`/patients/${sale.animal?.id}`)}>{sale.animal.nickname}</Typography.Link> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Счёт">
                {sale?.bill ? <Typography.Link onClick={() => navigate(`/bills/${sale.bill?.id}`)}>{sale.bill.id.slice(0, 8)}</Typography.Link> : '—'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
        <div className="list-panel">
          <div className="list-panel-header">
            <Typography.Title level={4} className="compact-title">Позиции продажи</Typography.Title>
          </div>
          <div className="list-panel-body">
            <Table<SaleItem>
              rowKey="id"
              className="dense-table"
              columns={itemColumns}
              dataSource={sale?.items ?? []}
              loading={saleQuery.isLoading}
              pagination={false}
              scroll={{ x: 860 }}
            />
          </div>
        </div>
        <div className="list-panel">
          <div className="list-panel-header">
            <Space direction="vertical" size={2}>
              <Typography.Title level={4} className="compact-title">Складские списания</Typography.Title>
              <Typography.Text type="secondary">Товарные позиции списываются по партиям FIFO.</Typography.Text>
            </Space>
          </div>
          <div className="list-panel-body">
            <Table<SaleStockMovement>
              rowKey="id"
              className="dense-table"
              columns={movementColumns}
              dataSource={sale?.stockMovements ?? []}
              loading={saleQuery.isLoading}
              pagination={false}
              locale={{ emptyText: 'Складских списаний нет' }}
              scroll={{ x: 920 }}
            />
          </div>
        </div>
      </Space>
    </div>
  );
}
