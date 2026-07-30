import { CheckCircleOutlined, FileExcelOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, AutoComplete, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { uploadSupplyFile } from '../files/files.api';
import { parseImportFile } from '../imports/import-file-parser';
import { createSupplyInvoice, listProducts } from './stock.api';
import { Product, StockResources } from './types';

type PreviewRow = {
  rowNumber: number;
  sourceTitle: string;
  sourceBarcode: string;
  product: Product | null;
  quantity: number | null;
  purchasePrice: number | null;
  discountAmount: number;
  expiresAt?: string;
  series?: string;
  status: 'MATCHED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID';
  message: string;
};

export function SupplyInvoiceImporter({ resources }: { resources?: StockResources }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierTitle, setSupplierTitle] = useState('');
  const [number, setNumber] = useState('');
  const [suppliedAt, setSuppliedAt] = useState(toDateInput(new Date()));
  const [warehouseId, setWarehouseId] = useState<string | undefined>(resources?.warehouses[0]?.id);
  const productsQuery = useQuery({
    queryKey: ['stock', 'products', 'all-for-supply-import'],
    queryFn: loadAllProducts,
    enabled: open,
    staleTime: 30_000,
  });
  const issues = rows.filter((row) => row.status !== 'MATCHED').length;
  const canApply = rows.length > 0 && issues === 0 && Boolean(warehouseId);

  async function selectFile(file: File) {
    setParsing(true);
    setError(null);
    setRows([]);
    try {
      const products = productsQuery.data ?? (await productsQuery.refetch()).data ?? [];
      const parsed = await parseImportFile(file);
      const prepared = mapSupplyRows(parsed.columns, parsed.rows, products);
      if (prepared.length > 500) throw new Error('В одной накладной можно загрузить не более 500 строк');
      const first = parsed.rows[0]?.data ?? {};
      const meta = findSupplyMetadata(parsed.columns, first);
      if (meta.supplierTitle) setSupplierTitle(meta.supplierTitle);
      if (meta.number) setNumber(meta.number);
      if (meta.suppliedAt) setSuppliedAt(meta.suppliedAt);
      setSourceFile(file);
      setRows(prepared);
    } catch (caught) {
      setSourceFile(null);
      setError(getErrorMessage(caught));
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function apply() {
    if (!canApply || !sourceFile || !warehouseId) return;
    setSaving(true);
    setError(null);
    try {
      const invoice = await createSupplyInvoice({
        supplierTitle: supplierTitle.trim() || undefined,
        number: number.trim() || undefined,
        suppliedAt: suppliedAt ? new Date(`${suppliedAt}T12:00:00`).toISOString() : undefined,
        items: rows.map((row) => ({
          productId: row.product!.id,
          warehouseId,
          quantity: row.quantity!,
          purchasePrice: row.purchasePrice!,
          discountAmount: row.discountAmount,
          expiresAt: row.expiresAt,
          series: row.series,
        })),
      });
      try {
        await uploadSupplyFile(invoice.id, sourceFile);
        message.success(`Накладная принята: ${rows.length} позиций. Исходный файл сохранён.`);
      } catch (uploadError) {
        message.warning(`Приёмка проведена, но исходный файл не сохранился: ${getErrorMessage(uploadError)}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      close();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setSourceFile(null);
    setRows([]);
    setError(null);
    setSupplierTitle('');
    setNumber('');
    setSuppliedAt(toDateInput(new Date()));
  }

  return (
    <>
      <Button icon={<UploadOutlined />} onClick={() => setOpen(true)}>Загрузить накладную</Button>
      <Modal
        title="Автоматическая загрузка накладной"
        open={open}
        onCancel={close}
        onOk={() => void apply()}
        okText="Провести приёмку"
        cancelText="Закрыть"
        okButtonProps={{ disabled: !canApply }}
        confirmLoading={saving}
        width={1050}
        destroyOnHidden
      >
        <Space direction="vertical" size={14} className="full-width">
          <Alert
            type="info"
            showIcon
            message="Автоматическое сопоставление без изменения склада до подтверждения"
            description="CRM распознает товар по штрих-коду, артикулу или точному названию, покажет все строки и заблокирует приёмку при неизвестном или неоднозначном товаре."
          />
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".xls,.xlsx,.csv,.tsv,.txt,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void selectFile(file);
            }}
          />
          <Button icon={<FileExcelOutlined />} loading={parsing || productsQuery.isLoading} onClick={() => fileInputRef.current?.click()}>
            {sourceFile ? 'Выбрать другой файл' : 'Выбрать XLS, XLSX, CSV или DOCX'}
          </Button>
          {sourceFile ? <Typography.Text>Файл: {sourceFile.name}</Typography.Text> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {rows.length ? (
            <>
              <Alert
                type={canApply ? 'success' : 'warning'}
                showIcon
                icon={canApply ? <CheckCircleOutlined /> : <WarningOutlined />}
                message={canApply ? `Все ${rows.length} позиций распознаны` : `Приёмка заблокирована: проблемных строк ${issues}`}
                description={canApply ? 'Проверьте реквизиты и нажмите «Провести приёмку».' : 'Исправьте название, артикул или штрих-код в исходном файле и снова выполните проверку.'}
              />
              <Form layout="vertical">
                <div className="form-grid two-columns">
                  <Form.Item label="Поставщик">
                    <AutoComplete
                      value={supplierTitle}
                      onChange={setSupplierTitle}
                      options={resources?.suppliers.map((supplier) => ({ value: supplier.title })) ?? []}
                      placeholder="Из файла или введите вручную"
                    />
                  </Form.Item>
                  <Form.Item label="№ накладной"><Input value={number} onChange={(event) => setNumber(event.target.value)} /></Form.Item>
                  <Form.Item label="Дата поставки"><Input type="date" value={suppliedAt} onChange={(event) => setSuppliedAt(event.target.value)} /></Form.Item>
                  <Form.Item label="Склад" required>
                    <Select value={warehouseId} onChange={setWarehouseId} options={resources?.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })) ?? []} />
                  </Form.Item>
                </div>
              </Form>
              <Table
                rowKey="rowNumber"
                size="small"
                pagination={false}
                scroll={{ x: 900, y: 360 }}
                dataSource={rows}
                columns={[
                  { title: 'Строка', dataIndex: 'rowNumber', width: 70 },
                  { title: 'Из файла', dataIndex: 'sourceTitle', width: 220 },
                  { title: 'Штрих-код', dataIndex: 'sourceBarcode', width: 140, render: (value) => value || '—' },
                  { title: 'Товар CRM', key: 'product', width: 220, render: (_, row) => row.product?.title ?? '—' },
                  { title: 'Кол-во', dataIndex: 'quantity', width: 90 },
                  { title: 'Закупка', dataIndex: 'purchasePrice', width: 100 },
                  { title: 'Проверка', key: 'status', render: (_, row) => <Tag color={row.status === 'MATCHED' ? 'green' : 'red'}>{row.message}</Tag> },
                ]}
              />
            </>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}

async function loadAllProducts() {
  const result: Product[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await listProducts({ limit: 100, offset });
    result.push(...page.items);
    if (result.length >= page.total || !page.items.length) return result;
  }
  throw new Error('В справочнике больше 5000 товаров. Уточните файл или воспользуйтесь поиском по товарам.');
}

const aliases = {
  title: ['товар', 'наименование', 'название', 'номенклатура', 'product'],
  barcode: ['штрихкод', 'barcode', 'ean', 'ean13', 'gtin'],
  sku: ['артикул', 'sku', 'кодтовара', 'кодноменклатуры'],
  quantity: ['количество', 'колво', 'qty', 'quantity'],
  purchasePrice: ['ценазакупки', 'закупочнаяцена', 'цена', 'price', 'purchaseprice'],
  discountAmount: ['скидка', 'суммаскидки', 'discount'],
  expiresAt: ['годендо', 'срокгодности', 'expiresat', 'expiry'],
  series: ['серия', 'партия', 'series', 'batch'],
  supplierTitle: ['поставщик', 'контрагент', 'supplier'],
  number: ['номернакладной', 'накладная', 'номердокумента', 'documentnumber'],
  suppliedAt: ['датанакладной', 'датапоставки', 'датадокумента', 'date'],
};

function mapSupplyRows(columns: string[], sourceRows: Array<{ rowNumber: number; data: Record<string, string> }>, products: Product[]) {
  const mapping = Object.fromEntries(Object.entries(aliases).map(([field, values]) => [field, findColumn(columns, values)])) as Record<keyof typeof aliases, string | undefined>;
  if (!mapping.title && !mapping.barcode && !mapping.sku) throw new Error('Не найдена колонка «Товар», «Артикул» или «Штрих-код»');
  if (!mapping.quantity) throw new Error('Не найдена колонка «Количество»');
  if (!mapping.purchasePrice) throw new Error('Не найдена колонка «Цена закупки»');

  const rows = sourceRows.map((row): PreviewRow => {
    const value = (field: keyof typeof aliases) => mapping[field] ? row.data[mapping[field]!]?.trim() ?? '' : '';
    const sourceTitle = value('title');
    const sourceBarcode = value('barcode').replace(/\s/g, '');
    const sourceSku = value('sku');
    const quantity = parseNumber(value('quantity'));
    const purchasePrice = parseNumber(value('purchasePrice'));
    const matches = matchProducts(products, sourceBarcode, sourceSku, sourceTitle);
    if (quantity === null || quantity <= 0 || purchasePrice === null || purchasePrice < 0) {
      return { rowNumber: row.rowNumber, sourceTitle, sourceBarcode, product: matches[0] ?? null, quantity, purchasePrice, discountAmount: 0, status: 'INVALID', message: 'Проверьте количество и цену' };
    }
    if (!matches.length) {
      return { rowNumber: row.rowNumber, sourceTitle, sourceBarcode, product: null, quantity, purchasePrice, discountAmount: parseNumber(value('discountAmount')) ?? 0, status: 'NOT_FOUND', message: 'Товар не найден' };
    }
    if (matches.length > 1) {
      return { rowNumber: row.rowNumber, sourceTitle, sourceBarcode, product: null, quantity, purchasePrice, discountAmount: parseNumber(value('discountAmount')) ?? 0, status: 'AMBIGUOUS', message: 'Найдено несколько товаров' };
    }
    return {
      rowNumber: row.rowNumber,
      sourceTitle,
      sourceBarcode,
      product: matches[0],
      quantity,
      purchasePrice,
      discountAmount: parseNumber(value('discountAmount')) ?? 0,
      expiresAt: parseDate(value('expiresAt')),
      series: value('series') || undefined,
      status: 'MATCHED',
      message: sourceBarcode ? 'По штрих-коду' : sourceSku ? 'По артикулу' : 'По названию',
    };
  }).filter((row) => Boolean(row.sourceTitle || row.sourceBarcode));
  if (!rows.length) throw new Error('В файле нет строк товаров');
  return rows;
}

function matchProducts(products: Product[], barcode: string, sku: string, title: string) {
  if (barcode) {
    const matches = products.filter((product) => allBarcodes(product).includes(barcode));
    if (matches.length) return matches;
  }
  if (sku) {
    const normalized = normalize(sku);
    const matches = products.filter((product) => normalize(product.sku ?? '') === normalized);
    if (matches.length) return matches;
  }
  const normalized = normalize(title);
  return normalized ? products.filter((product) => normalize(product.title) === normalized) : [];
}

function allBarcodes(product: Product) {
  return [...new Set([
    ...(product.barcode?.split(/[;,\r\n]+/) ?? []),
    product.gtin ?? '',
    ...(product.barcodes?.map((item) => item.value) ?? []),
  ].map((value) => value.trim()).filter(Boolean))];
}

function findSupplyMetadata(columns: string[], row: Record<string, string>) {
  const get = (field: 'supplierTitle' | 'number' | 'suppliedAt') => {
    const column = findColumn(columns, aliases[field]);
    return column ? row[column]?.trim() ?? '' : '';
  };
  return { supplierTitle: get('supplierTitle'), number: get('number'), suppliedAt: parseDateInput(get('suppliedAt')) };
}

function findColumn(columns: string[], values: string[]) {
  const exact = columns.find((column) => values.includes(normalize(column)));
  if (exact) return exact;
  return columns.find((column) => values.some((alias) => alias.length >= 4 && normalize(column).includes(alias)));
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/g, '');
}

function parseNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value: string) {
  const input = parseDateInput(value);
  return input ? new Date(`${input}T12:00:00`).toISOString() : undefined;
}

function parseDateInput(value: string) {
  if (!value) return '';
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const ru = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`;
  return '';
}

function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
