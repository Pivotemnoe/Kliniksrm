import { CheckOutlined, CloseOutlined, EditOutlined, EyeOutlined, PlusOutlined, RetweetOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import {
  cancelStockDocument,
  createStockDocument,
  createSupplierPayment,
  getStockResources,
  listStockBatches,
  listStockDocuments,
  listStockMovements,
  listProducts,
  listSupplierBalances,
  postStockDocument,
  updateStockDocument,
} from './stock.api';
import { StockDocument, StockDocumentMutationInput, StockDocumentType, StockMovement, StockResources, Supplier, SupplierBalance } from './types';
import { SupplierModal } from './SupplierModal';

const historyPageSize = 20;

const documentTitles: Record<StockDocumentType, string> = {
  INVENTORY: 'Инвентаризация',
  TRANSFER: 'Перемещение',
  SUPPLIER_RETURN: 'Возврат поставщику',
  WRITE_OFF: 'Списание',
  RESORTING: 'Пересортица',
  CORRECTION: 'Корректировка',
};

const movementTitles: Record<string, string> = {
  SUPPLY: 'Приёмка', SALE: 'Продажа', VISIT_USAGE: 'Использовано на приёме', WRITE_OFF: 'Списание',
  TRANSFER: 'Перемещение', CORRECTION: 'Корректировка', SUPPLIER_RETURN: 'Возврат поставщику',
  INVENTORY: 'Инвентаризация', RESORTING: 'Пересортица',
};

export function StockOperationsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'stock.manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProductId = searchParams.get('inventoryProductId') ?? undefined;
  const [documentOpen, setDocumentOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<StockDocument | null>(null);
  const [correctionSource, setCorrectionSource] = useState<StockDocument | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<StockDocument | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<SupplierBalance | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [documentPage, setDocumentPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const resourcesQuery = useQuery({ queryKey: ['stock', 'resources'], queryFn: getStockResources });
  const documentsQuery = useQuery({
    queryKey: ['stock', 'documents', documentPage],
    queryFn: () => listStockDocuments({ limit: historyPageSize, offset: (documentPage - 1) * historyPageSize }),
  });
  const movementsQuery = useQuery({
    queryKey: ['stock', 'movements', movementPage],
    queryFn: () => listStockMovements({ limit: historyPageSize, offset: (movementPage - 1) * historyPageSize }),
  });
  const suppliersQuery = useQuery({ queryKey: ['stock', 'supplier-balances'], queryFn: listSupplierBalances, enabled: canManage });

  useEffect(() => {
    if (canManage && initialProductId) {
      setEditingDocument(null);
      setCorrectionSource(null);
      setDocumentOpen(true);
    }
  }, [canManage, initialProductId]);

  function closeDocumentModal() {
    setDocumentOpen(false);
    setEditingDocument(null);
    setCorrectionSource(null);
    if (initialProductId) setSearchParams({}, { replace: true });
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ]);
  }

  const postMutation = useMutation({ mutationFn: postStockDocument, onSuccess: async () => { await refresh(); message.success('Документ проведён, остатки обновлены'); }, onError: (error) => message.error(getErrorMessage(error)) });
  const cancelMutation = useMutation({ mutationFn: cancelStockDocument, onSuccess: async () => { await refresh(); message.success('Черновик отменён'); }, onError: (error) => message.error(getErrorMessage(error)) });

  const documentColumns = useMemo<ColumnsType<StockDocument>>(() => [
    { title: 'Дата', dataIndex: 'occurredAt', key: 'occurredAt', render: formatDate },
    { title: 'Документ', key: 'type', render: (_, row) => <><div>{documentTitles[row.type]}</div><Typography.Text type="secondary">{row.number || `№ ${row.id.slice(0, 8)}`}</Typography.Text></> },
    { title: 'Склад', key: 'warehouse', render: (_, row) => row.toWarehouse ? `${row.warehouse?.name ?? '—'} → ${row.toWarehouse.name}` : row.warehouse?.name ?? '—' },
    { title: 'Поставщик', key: 'supplier', render: (_, row) => row.supplier?.title ?? '—' },
    { title: 'Позиций', key: 'items', render: (_, row) => row.items.length },
    { title: 'Статус', dataIndex: 'status', key: 'status', render: (value) => value === 'POSTED' ? <Tag color="green">Проведён</Tag> : value === 'CANCELLED' ? <Tag>Отменён</Tag> : <Tag color="blue">Черновик</Tag> },
    { title: '', key: 'open', width: 110, render: (_: unknown, row: StockDocument) => <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedDocument(row)}>Открыть</Button> },
    ...(canManage ? [{ title: 'Действия', key: 'actions', width: 360, render: (_: unknown, row: StockDocument) => row.status === 'DRAFT' ? <Space wrap><Button icon={<EditOutlined />} onClick={() => { setEditingDocument(row); setDocumentOpen(true); }}>Изменить</Button><Button type="primary" icon={<CheckOutlined />} loading={postMutation.isPending} onClick={() => modal.confirm({ title: 'Провести документ?', content: 'После проведения прямое редактирование будет закрыто. Дальнейшие изменения оформляются отдельной корректировкой.', okText: 'Провести', cancelText: 'Отмена', onOk: () => postMutation.mutateAsync(row.id) })}>Провести</Button><Button danger icon={<CloseOutlined />} loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate(row.id)}>Отменить</Button></Space> : row.status === 'POSTED' ? <Button icon={<RetweetOutlined />} onClick={() => { setCorrectionSource(row); setDocumentOpen(true); }}>Создать корректировку</Button> : null }] : []),
  ], [canManage, cancelMutation, modal, postMutation]);

  const movementColumns: ColumnsType<StockMovement> = [
    { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
    { title: 'Операция', dataIndex: 'type', key: 'type', render: (value) => movementTitles[value] ?? value },
    { title: 'Товар', key: 'product', render: (_, row) => row.product.title },
    { title: 'Количество', key: 'quantity', render: (_, row) => `${Number(row.quantity) > 0 ? '+' : ''}${row.quantity} ${row.product.stockUnit ?? ''}` },
    { title: 'Приходная цена', key: 'unitCost', render: (_, row) => row.unitCost === null ? (row.stockBatch ? formatMoney(row.stockBatch.purchasePrice) : '—') : formatMoney(row.unitCost) },
    { title: 'Склад', key: 'warehouse', render: (_, row) => row.toWarehouse ? `${row.warehouse?.name ?? '—'} → ${row.toWarehouse.name}` : row.warehouse?.name ?? '—' },
    { title: 'Основание', key: 'document', render: (_, row) => row.stockDocument ? `${documentTitles[row.stockDocument.type]} ${row.stockDocument.number ?? ''}`.trim() : row.comment ?? '—' },
  ];

  const supplierColumns: ColumnsType<SupplierBalance> = [
    { title: 'Поставщик', dataIndex: 'title', key: 'title' },
    { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (value) => value || '—' },
    { title: 'ИНН', dataIndex: 'inn', key: 'inn', render: (value) => value || '—' },
    { title: 'Поставлено', dataIndex: 'suppliedAmount', key: 'suppliedAmount', render: formatMoney },
    { title: 'Возвращено', dataIndex: 'returnedAmount', key: 'returnedAmount', render: formatMoney },
    { title: 'Оплачено', dataIndex: 'paidAmount', key: 'paidAmount', render: formatMoney },
    { title: 'К оплате', dataIndex: 'balance', key: 'balance', render: (value) => <strong>{formatMoney(value)}</strong> },
    ...(canManage ? [{ title: '', key: 'action', width: 270, render: (_: unknown, row: SupplierBalance) => <Space><Button icon={<EditOutlined />} onClick={() => { setEditingSupplier(row); setSupplierOpen(true); }}>Изменить</Button><Button onClick={() => setPaymentSupplier(row)}>Внести оплату</Button></Space> }] : []),
  ];

  return <div className="page">
    <PageHeader title="Складские операции" description="Инвентаризации, перемещения, возвраты, списания, пересортица и взаиморасчёты с поставщиками." extra={canManage ? <Space wrap><Button icon={<PlusOutlined />} onClick={() => { setEditingSupplier(null); setSupplierOpen(true); }}>Новый поставщик</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingDocument(null); setCorrectionSource(null); setDocumentOpen(true); }}>Новый документ</Button></Space> : null} />
    <div className="list-panel"><Tabs items={[
      { key: 'documents', label: 'Документы', children: <Table rowKey="id" columns={documentColumns} dataSource={documentsQuery.data?.items ?? []} loading={documentsQuery.isLoading} pagination={{ current: documentPage, pageSize: historyPageSize, total: documentsQuery.data?.total ?? 0, showSizeChanger: false, onChange: setDocumentPage }} scroll={{ x: 1050 }} /> },
      { key: 'movements', label: 'История движения', children: <Table rowKey="id" columns={movementColumns} dataSource={movementsQuery.data?.items ?? []} loading={movementsQuery.isLoading} pagination={{ current: movementPage, pageSize: historyPageSize, total: movementsQuery.data?.total ?? 0, showSizeChanger: false, onChange: setMovementPage }} scroll={{ x: 1100 }} /> },
      ...(canManage ? [{ key: 'suppliers', label: 'Поставщики и расчёты', children: <Table rowKey="id" columns={supplierColumns} dataSource={suppliersQuery.data ?? []} loading={suppliersQuery.isLoading} pagination={false} scroll={{ x: 850 }} /> }] : []),
    ]} /></div>
    <StockDocumentModal open={documentOpen} document={editingDocument} correctionSource={correctionSource} initialProductId={initialProductId} resources={resourcesQuery.data} onClose={closeDocumentModal} onSaved={refresh} />
    <SupplierPaymentModal supplier={paymentSupplier} resources={resourcesQuery.data} onClose={() => setPaymentSupplier(null)} onSaved={refresh} />
    <SupplierModal open={supplierOpen} supplier={editingSupplier} onClose={() => { setSupplierOpen(false); setEditingSupplier(null); }} />
    <StockDocumentDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />
  </div>;
}

type DocumentFormValues = {
  type: StockDocumentType;
  number?: string;
  warehouseId: string;
  toWarehouseId?: string;
  supplierId?: string;
  occurredAt: Dayjs;
  comment?: string;
  items: Array<{ sourceBatchId: string; productId?: string; quantity?: number; actualQuantity?: number; unitCost?: number; retailPrice?: number; targetProductId?: string; comment?: string }>;
};

function StockDocumentModal({ open, document, correctionSource, initialProductId, resources, onClose, onSaved }: { open: boolean; document?: StockDocument | null; correctionSource?: StockDocument | null; initialProductId?: string; resources?: Awaited<ReturnType<typeof getStockResources>>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DocumentFormValues>();
  const [batchSearch, setBatchSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const deferredBatchSearch = useDeferredValue(batchSearch);
  const deferredProductSearch = useDeferredValue(productSearch);
  const type = Form.useWatch('type', form) ?? 'INVENTORY';
  const warehouseId = Form.useWatch('warehouseId', form);
  const supplierId = Form.useWatch('supplierId', form);
  const needsActual = type === 'INVENTORY' || type === 'CORRECTION';
  const batchesQuery = useQuery({
    queryKey: ['stock', 'batches', 'document', warehouseId, initialProductId, deferredBatchSearch],
    queryFn: () => listStockBatches({ warehouseId, productId: initialProductId, search: deferredBatchSearch || undefined, limit: 100, offset: 0 }),
    enabled: open,
  });
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'document', initialProductId, deferredProductSearch],
    queryFn: () => listProducts({ productId: initialProductId, search: deferredProductSearch || undefined, limit: 100, offset: 0 }),
    enabled: open && (needsActual || type === 'RESORTING'),
  });
  const visibleBatches = (batchesQuery.data?.items ?? []).filter((batch) =>
    (needsActual || Number(batch.rest) > 0)
    && (type !== 'SUPPLIER_RETURN' || !supplierId || !batch.supplierId || batch.supplierId === supplierId),
  );
  const knownItems = document?.items ?? correctionSource?.items ?? [];
  const rawBatchOptions = [
    ...visibleBatches.map((batch) => ({ value: batch.id, productId: batch.productId, unitCost: Number(batch.purchasePrice), retailPrice: Number(batch.product?.retailPrice ?? 0), label: `${batch.product?.title ?? batch.productId} · остаток ${batch.rest}${batch.series ? ` · серия ${batch.series}` : ''}` })),
    ...knownItems.filter((item) => item.sourceBatchId && !visibleBatches.some((batch) => batch.id === item.sourceBatchId)).map((item) => ({ value: item.sourceBatchId!, productId: item.productId, unitCost: Number(item.sourceBatch?.purchasePrice ?? item.unitCost ?? 0), retailPrice: Number(item.retailPrice ?? item.product?.retailPrice ?? 0), label: `${item.product?.title ?? item.productId} · остаток ${item.sourceBatch?.rest ?? '—'}${item.sourceBatch?.series ? ` · серия ${item.sourceBatch.series}` : ''}` })),
    ...knownItems.filter((item) => !item.sourceBatchId).map((item) => ({ value: `NEW:${item.productId}`, productId: item.productId, unitCost: Number(item.unitCost ?? 0), retailPrice: Number(item.retailPrice ?? item.product?.retailPrice ?? 0), label: `${item.product?.title ?? item.productId} · новая учётная партия без накладной` })),
    ...(needsActual ? (productsQuery.data?.items ?? []).map((product) => ({ value: `NEW:${product.id}`, productId: product.id, unitCost: 0, retailPrice: Number(product.retailPrice), label: `${product.title} · новая учётная партия без накладной` })) : []),
  ];
  const batchOptions = Array.from(new Map(rawBatchOptions.map((option) => [option.value, option])).values());
  const mutation = useMutation({
    mutationFn: (input: StockDocumentMutationInput) => document ? updateStockDocument(document.id, input) : createStockDocument(input),
    onSuccess: async () => { await onSaved(); message.success(document ? 'Черновик документа сохранён' : 'Черновик создан. Проверьте его и нажмите «Провести»'); form.resetFields(); onClose(); },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(getDocumentFormValues(document, correctionSource, resources?.warehouses[0]?.id, initialProductId));
  }, [correctionSource, document, form, initialProductId, open, resources?.warehouses]);
  function submit(values: DocumentFormValues) {
    const input: StockDocumentMutationInput = {
      type: values.type,
      number: values.number,
      warehouseId: values.warehouseId,
      toWarehouseId: values.toWarehouseId,
      supplierId: values.supplierId,
      occurredAt: values.occurredAt.toISOString(),
      comment: values.comment,
      items: values.items.map((item) => {
        if (!item.productId) throw new Error('У выбранной партии не определён товар');
        return { productId: item.productId, sourceBatchId: item.sourceBatchId.startsWith('NEW:') ? undefined : item.sourceBatchId, quantity: item.quantity, actualQuantity: item.actualQuantity, unitCost: item.unitCost, retailPrice: item.retailPrice, targetProductId: item.targetProductId, comment: item.comment };
      }),
    };
    mutation.mutate(input);
  }
  return <Modal open={open} title={document ? 'Редактирование складского документа' : correctionSource ? `Корректировка документа ${correctionSource.number || correctionSource.id.slice(0, 8)}` : 'Новый складской документ'} onCancel={onClose} okText={document ? 'Сохранить черновик' : 'Создать черновик'} cancelText="Отмена" confirmLoading={mutation.isPending} onOk={() => form.submit()} destroyOnHidden width={920}>
    <Form form={form} layout="vertical" onFinish={submit}>
      <Space wrap align="start">
        <Form.Item name="type" label="Операция" rules={[{ required: true }]}><Select style={{ width: 220 }} options={Object.entries(documentTitles).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="warehouseId" label="Склад" rules={[{ required: true }]}><Select style={{ width: 220 }} options={resources?.warehouses.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        {type === 'TRANSFER' ? <Form.Item name="toWarehouseId" label="Склад назначения" rules={[{ required: true }]}><Select style={{ width: 220 }} options={resources?.warehouses.filter((item) => item.id !== warehouseId).map((item) => ({ value: item.id, label: item.name }))} /></Form.Item> : null}
        {type === 'SUPPLIER_RETURN' ? <Form.Item name="supplierId" label="Поставщик" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" style={{ width: 260 }} options={resources?.suppliers.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item> : null}
        <Form.Item name="number" label="Номер"><Input style={{ width: 180 }} /></Form.Item>
        <Form.Item name="occurredAt" label="Дата" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
      </Space>
      <Form.List name="items">{(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%' }}>
          {fields.map((field, index) => (
            <Space key={field.key} wrap align="start">
              <Form.Item name={[field.name, 'sourceBatchId']} label={index === 0 ? 'Партия или новый остаток' : undefined} rules={[{ required: true, message: 'Выберите партию или товар без накладной' }]}>
                <Select
                  showSearch
                  filterOption={false}
                  onSearch={setBatchSearch}
                  onChange={(value) => {
                    const batch = batchOptions.find((candidate) => candidate.value === value);
                    form.setFieldValue(['items', field.name, 'productId'], batch?.productId);
                    form.setFieldValue(['items', field.name, 'unitCost'], batch?.unitCost);
                    form.setFieldValue(['items', field.name, 'retailPrice'], batch?.retailPrice);
                  }}
                  loading={batchesQuery.isFetching || productsQuery.isFetching}
                  placeholder="Выберите партию или новую учётную партию"
                  style={{ width: 390 }}
                  options={batchOptions.map(({ value, label }) => ({ value, label }))}
                />
              </Form.Item>
              {needsActual ? (
                <Form.Item name={[field.name, 'actualQuantity']} label={index === 0 ? 'Фактический остаток' : undefined} rules={[{ required: true }]}>
                  <InputNumber min={0} precision={3} />
                </Form.Item>
              ) : (
                <Form.Item name={[field.name, 'quantity']} label={index === 0 ? 'Количество' : undefined} rules={[{ required: true }]}>
                  <InputNumber min={0.001} precision={3} />
                </Form.Item>
              )}
              {needsActual ? (
                <Form.Item name={[field.name, 'unitCost']} label={index === 0 ? 'Приходная цена' : undefined} rules={[{ required: true, message: 'Укажите приходную цену' }]}>
                  <InputNumber min={0.01} precision={2} addonAfter="₽" />
                </Form.Item>
              ) : null}
              {needsActual ? (
                <Form.Item name={[field.name, 'retailPrice']} label={index === 0 ? 'Цена продажи' : undefined} rules={[{ required: true, message: 'Укажите цену продажи' }]}>
                  <InputNumber min={0.01} precision={2} addonAfter="₽" />
                </Form.Item>
              ) : null}
              {type === 'RESORTING' ? (
                <Form.Item name={[field.name, 'targetProductId']} label={index === 0 ? 'Целевой товар' : undefined} rules={[{ required: true }]}>
                  <Select showSearch filterOption={false} onSearch={setProductSearch} loading={productsQuery.isFetching} placeholder="Введите название или код" style={{ width: 300 }} options={(productsQuery.data?.items ?? []).map((item) => ({ value: item.id, label: item.title }))} />
                </Form.Item>
              ) : null}
              <Button danger disabled={fields.length === 1} onClick={() => remove(field.name)}>Убрать</Button>
            </Space>
          ))}
          <Button onClick={() => add({})}>Добавить позицию</Button>
        </Space>
      )}</Form.List>
        <Form.Item name="comment" label="Комментарий" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
      <Space direction="vertical" size={4}>
        <Typography.Text type="secondary">Черновик не меняет остатки. Изменение произойдёт только после отдельного подтверждения «Провести».</Typography.Text>
        {needsActual ? <Typography.Text type="secondary">Для каждой позиции проверьте фактический остаток, приходную цену партии и цену продажи клиенту. При проведении инвентаризации эти две цены обновятся вместе с остатком.</Typography.Text> : null}
      </Space>
    </Form>
  </Modal>;
}

function getDocumentFormValues(document?: StockDocument | null, correctionSource?: StockDocument | null, defaultWarehouseId?: string, initialProductId?: string): DocumentFormValues {
  if (document) {
    return {
      type: document.type,
      number: document.number ?? undefined,
      warehouseId: document.warehouseId ?? defaultWarehouseId ?? '',
      toWarehouseId: document.toWarehouseId ?? undefined,
      supplierId: document.supplierId ?? undefined,
      occurredAt: dayjs(document.occurredAt),
      comment: document.comment ?? undefined,
      items: document.items.map((item) => ({
        sourceBatchId: item.sourceBatchId ?? `NEW:${item.productId}`,
        productId: item.productId,
        quantity: item.quantity === null ? undefined : Number(item.quantity),
        actualQuantity: item.actualQuantity === null ? undefined : Number(item.actualQuantity),
        unitCost: item.unitCost === null ? undefined : Number(item.unitCost),
        retailPrice: item.retailPrice === null ? Number(item.product?.retailPrice ?? 0) : Number(item.retailPrice),
        targetProductId: item.targetProductId ?? undefined,
        comment: item.comment ?? undefined,
      })),
    };
  }
  if (correctionSource) {
    return {
      type: 'CORRECTION',
      number: `Испр. ${correctionSource.number || correctionSource.id.slice(0, 8)}`,
      warehouseId: correctionSource.warehouseId ?? defaultWarehouseId ?? '',
      occurredAt: dayjs(),
      comment: `Корректировка складского документа ${correctionSource.number || correctionSource.id}`,
      items: correctionSource.items.filter((item) => item.sourceBatchId).map((item) => ({
        sourceBatchId: item.sourceBatchId!,
        productId: item.productId,
        actualQuantity: Number(item.sourceBatch?.rest ?? 0),
        unitCost: Number(item.sourceBatch?.purchasePrice ?? item.unitCost ?? 0),
        retailPrice: Number(item.retailPrice ?? item.product?.retailPrice ?? 0),
      })),
    };
  }
  return { type: 'INVENTORY', warehouseId: defaultWarehouseId ?? '', occurredAt: dayjs(), items: [{ sourceBatchId: '', productId: initialProductId }] };
}

function StockDocumentDrawer({ document, onClose }: { document: StockDocument | null; onClose: () => void }) {
  return <Drawer title={document ? `${documentTitles[document.type]} ${document.number || ''}`.trim() : 'Складской документ'} open={Boolean(document)} onClose={onClose} width={760} destroyOnHidden>
    {document ? <Space direction="vertical" size={16} className="full-width">
      <Typography.Text>{formatDate(document.occurredAt)} · {document.warehouse?.name ?? 'Склад не указан'} · {document.supplier?.title ?? 'Без поставщика'}</Typography.Text>
      <Table rowKey="id" size="small" pagination={false} dataSource={document.items} columns={[
        { title: 'Товар', key: 'product', render: (_, item) => item.product?.title ?? '—' },
        { title: 'Партия', key: 'batch', render: (_, item) => item.sourceBatch?.series || item.sourceBatchId?.slice(0, 8) || '—' },
        { title: document.type === 'INVENTORY' || document.type === 'CORRECTION' ? 'Фактически' : 'Количество', key: 'quantity', render: (_, item) => item.actualQuantity ?? item.quantity ?? '—' },
      ]} />
      {document.comment ? <Typography.Paragraph>{document.comment}</Typography.Paragraph> : null}
    </Space> : null}
  </Drawer>;
}

function SupplierPaymentModal({ supplier, resources, onClose, onSaved }: { supplier: SupplierBalance | null; resources?: StockResources; onClose: () => void; onSaved: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ amount: number; paidAt: Dayjs; supplyInvoiceId?: string; cashboxId?: string; paymentMethodId?: string; comment?: string }>();
  const mutation = useMutation({ mutationFn: (values: { amount: number; paidAt: Dayjs; supplyInvoiceId?: string; cashboxId?: string; paymentMethodId?: string; comment?: string }) => createSupplierPayment({ supplierId: supplier!.id, amount: values.amount, paidAt: values.paidAt.toISOString(), supplyInvoiceId: values.supplyInvoiceId, cashboxId: values.cashboxId, paymentMethodId: values.paymentMethodId, comment: values.comment }), onSuccess: async () => { await onSaved(); message.success('Оплата поставщику зарегистрирована'); form.resetFields(); onClose(); }, onError: (error) => message.error(getErrorMessage(error)) });
  return <Modal open={Boolean(supplier)} title={`Оплата поставщику: ${supplier?.title ?? ''}`} onCancel={onClose} okText="Зарегистрировать" cancelText="Отмена" confirmLoading={mutation.isPending} onOk={() => form.submit()} destroyOnHidden><Form form={form} layout="vertical" initialValues={{ paidAt: dayjs() }} onFinish={(values) => mutation.mutate(values)}><Form.Item name="amount" label="Сумма" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} addonAfter="₽" style={{ width: '100%' }} /></Form.Item><Form.Item name="supplyInvoiceId" label="Накладная (необязательно)"><Select allowClear options={supplier?.invoices.map((item) => ({ value: item.id, label: `${item.number || 'Без номера'} · ${formatDate(item.suppliedAt)} · ${formatMoney(item.totalAmount)}` }))} /></Form.Item><Space wrap align="start"><Form.Item name="cashboxId" label="Из кассы" rules={[{ required: true, message: 'Выберите кассу' }]}><Select style={{ width: 220 }} options={resources?.cashboxes.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item><Form.Item name="paymentMethodId" label="Способ оплаты" rules={[{ required: true, message: 'Выберите способ оплаты' }]}><Select style={{ width: 220 }} options={resources?.paymentMethods.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item></Space><Typography.Paragraph type="secondary">Касса и способ оплаты нужны, чтобы расход автоматически попал в закрытие дня.</Typography.Paragraph><Form.Item name="paidAt" label="Дата оплаты" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item><Form.Item name="comment" label="Комментарий"><Input.TextArea rows={2} /></Form.Item></Form></Modal>;
}
