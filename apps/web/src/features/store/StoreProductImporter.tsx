import { CheckCircleOutlined, FileExcelOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import { App, Alert, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { parseImportFile } from '../imports/import-file-parser';
import { importStoreProducts } from './store.api';
import type { StoreProductInput } from './types';

type ImportRow = StoreProductInput & { rowNumber: number; status: 'READY' | 'INVALID'; issue?: string };

export function StoreProductImporter({ onSaved }: { onSaved: () => Promise<void> | void }) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string>();
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const invalidCount = rows.filter((row) => row.status === 'INVALID').length;
  const canSave = rows.length > 0 && invalidCount === 0;

  async function selectFile(file: File) {
    setParsing(true);
    setError(undefined);
    setRows([]);
    try {
      const parsed = await parseImportFile(file);
      if (parsed.rows.length > 500) throw new Error('За один раз можно загрузить не более 500 товаров');
      const prepared = mapImportRows(parsed.columns, parsed.rows);
      setFileName(file.name);
      setRows(prepared);
    } catch (caught) {
      setFileName('');
      setError(getErrorMessage(caught));
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await importStoreProducts(rows.map(({ rowNumber: _rowNumber, status: _status, issue: _issue, ...item }) => item));
      message.success(`Загружено: ${result.total}. Новых: ${result.created}, обновлено: ${result.updated}`);
      await onSaved();
      close();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setFileName('');
    setRows([]);
    setError(undefined);
  }

  return (
    <>
      <Button icon={<UploadOutlined />} onClick={() => setOpen(true)}>Загрузить товары</Button>
      <Modal
        title="Загрузка товаров магазина"
        open={open}
        onCancel={close}
        onOk={() => void save()}
        okText="Загрузить в магазин"
        cancelText="Отмена"
        okButtonProps={{ disabled: !canSave }}
        confirmLoading={saving}
        width={1040}
        destroyOnHidden
      >
        <Space direction="vertical" size={14} className="full-width">
          <Alert type="info" showIcon message="Это отдельный каталог магазина" description="Загрузка не создаёт товары и услуги клиники, складские движения, счета, доходы или расходы." />
          <input ref={inputRef} hidden type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,.docx" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void selectFile(file);
          }} />
          <Button icon={<FileExcelOutlined />} loading={parsing} onClick={() => inputRef.current?.click()}>
            {fileName ? 'Выбрать другой файл' : 'Выбрать XLS, XLSX, CSV или DOCX'}
          </Button>
          {fileName ? <Typography.Text>Файл: {fileName}</Typography.Text> : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {rows.length ? (
            <>
              <Alert
                type={canSave ? 'success' : 'warning'}
                showIcon
                icon={canSave ? <CheckCircleOutlined /> : <WarningOutlined />}
                message={canSave ? `Готово к загрузке: ${rows.length} товаров` : `Нужно исправить строк: ${invalidCount}`}
                description="Колонки: название/товар, цена, категория, артикул, штрих-код, единица, НДС, описание. Повторная загрузка обновляет позицию по штрих-коду, артикулу или точному названию."
              />
              <Table
                rowKey="rowNumber"
                size="small"
                pagination={false}
                scroll={{ x: 900, y: 360 }}
                dataSource={rows}
                columns={[
                  { title: 'Строка', dataIndex: 'rowNumber', width: 70 },
                  { title: 'Название', dataIndex: 'title', width: 240 },
                  { title: 'Категория', dataIndex: 'categoryTitle', width: 150, render: (value) => value || '—' },
                  { title: 'Цена', dataIndex: 'retailPrice', width: 110 },
                  { title: 'Артикул', dataIndex: 'sku', width: 130, render: (value) => value || '—' },
                  { title: 'Штрих-код', dataIndex: 'barcode', width: 150, render: (value) => value || '—' },
                  { title: 'Проверка', key: 'status', render: (_, row) => <Tag color={row.status === 'READY' ? 'green' : 'red'}>{row.issue || 'Готово'}</Tag> },
                ]}
              />
            </>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}

const aliases = {
  title: ['товар', 'наименование', 'название', 'product'],
  categoryTitle: ['категория', 'группа', 'category'],
  retailPrice: ['ценапродажи', 'розничнаяцена', 'цена', 'price'],
  sku: ['артикул', 'sku', 'кодтовара'],
  barcode: ['штрихкод', 'barcode', 'ean', 'ean13', 'gtin'],
  unit: ['единица', 'едизм', 'unit'],
  vatRate: ['ндс', 'vat'],
  description: ['описание', 'комментарий', 'description'],
};

function mapImportRows(columns: string[], sourceRows: Array<{ rowNumber: number; data: Record<string, string> }>): ImportRow[] {
  const mapping = Object.fromEntries(Object.entries(aliases).map(([field, values]) => [field, findColumn(columns, values)])) as Record<keyof typeof aliases, string | undefined>;
  if (!mapping.title) throw new Error('Не найдена колонка «Название» или «Товар»');
  if (!mapping.retailPrice) throw new Error('Не найдена колонка «Цена»');
  const seen = new Set<string>();
  return sourceRows
    .filter((row) => Object.values(row.data).some((value) => value.trim()))
    .map((row) => {
      const title = readCell(row.data, mapping.title);
      const price = parseNumber(readCell(row.data, mapping.retailPrice));
      const sku = readCell(row.data, mapping.sku);
      const barcode = readCell(row.data, mapping.barcode);
      const duplicateKey = barcode ? `barcode:${barcode}` : sku ? `sku:${sku}` : `title:${normalize(title)}`;
      let issue = !title ? 'Нет названия' : price === null || price < 0 ? 'Неверная цена' : undefined;
      if (!issue && seen.has(duplicateKey)) issue = 'Повтор в файле';
      seen.add(duplicateKey);
      return {
        rowNumber: row.rowNumber,
        title,
        categoryTitle: readCell(row.data, mapping.categoryTitle) || undefined,
        retailPrice: price ?? 0,
        sku: sku || undefined,
        barcode: barcode || undefined,
        unit: readCell(row.data, mapping.unit) || 'шт',
        vatRate: parseOptionalNumber(readCell(row.data, mapping.vatRate)),
        description: readCell(row.data, mapping.description) || undefined,
        status: issue ? 'INVALID' : 'READY',
        issue,
      };
    });
}

function findColumn(columns: string[], candidates: string[]) {
  return columns.find((column) => candidates.includes(normalize(column)));
}

function readCell(row: Record<string, string>, column?: string) {
  return column ? String(row[column] ?? '').trim() : '';
}

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string) {
  const parsed = parseNumber(value);
  return parsed === null ? undefined : parsed;
}

function normalize(value: string) {
  return value.toLocaleLowerCase('ru').replace(/[^a-zа-яё0-9]+/gi, '');
}
