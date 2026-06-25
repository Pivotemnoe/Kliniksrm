import { DownloadOutlined, FileSearchOutlined, ImportOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Segmented, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { commitVetafImport, previewVetafImport, VetafImportIssue, VetafImportKind, VetafImportResult, VetafImportRow } from './imports.api';

type ParsedFile = {
  fileName: string;
  rows: VetafImportRow[];
};

const kindOptions = [
  { label: 'Клиенты и пациенты', value: 'clients' },
  { label: 'Товары и остатки', value: 'stock' },
] satisfies Array<{ label: string; value: VetafImportKind }>;

export function VetafImportPage() {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<VetafImportKind>('clients');
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<VetafImportResult | null>(null);
  const previewMutation = useMutation({
    mutationFn: () => previewVetafImport(kind, parsedFile?.rows ?? []),
    onSuccess: setResult,
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const commitMutation = useMutation({
    mutationFn: () => commitVetafImport(kind, parsedFile?.rows ?? []),
    onSuccess: (nextResult) => {
      setResult(nextResult);
      message.success('Импорт выполнен');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const sampleColumns = useMemo(() => buildSampleColumns(result), [result]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setResult(null);
    setParseError(null);

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const rows = parseDelimitedTable(text);
      setParsedFile({ fileName: file.name, rows });
      message.success(`Файл прочитан: ${rows.length} строк`);
    } catch (error) {
      setParsedFile(null);
      setParseError(error instanceof Error ? error.message : 'Не удалось прочитать файл');
    }
  }

  function downloadTemplate() {
    const content = kind === 'clients' ? clientTemplate : stockTemplate;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = kind === 'clients' ? 'vetaf-clients-template.csv' : 'vetaf-stock-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <PageHeader title="Импорт ВетаФ" description="Перенос клиентской базы, пациентов, товаров и остатков через CSV или TSV файл." />
      <div className="list-panel">
        <div className="list-panel-body">
          <Space direction="vertical" size={16} className="full-width">
            <Space wrap>
              <Segmented<VetafImportKind> value={kind} options={kindOptions} onChange={(value) => {
                setKind(value);
                setResult(null);
              }} />
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                Скачать шаблон
              </Button>
              <Button icon={<ImportOutlined />} onClick={() => inputRef.current?.click()}>
                Выбрать файл
              </Button>
              <input ref={inputRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
            </Space>

            {parseError ? <Alert type="error" showIcon message={parseError} /> : null}
            {parsedFile ? (
              <Alert
                type="info"
                showIcon
                message={`${parsedFile.fileName}: ${parsedFile.rows.length} строк`}
                action={
                  <Space>
                    <Button icon={<FileSearchOutlined />} loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                      Проверить файл
                    </Button>
                    <Button
                      type="primary"
                      icon={<ImportOutlined />}
                      loading={commitMutation.isPending}
                      disabled={!result || result.summary.errorRows > 0}
                      onClick={() => commitMutation.mutate()}
                    >
                      Импортировать
                    </Button>
                  </Space>
                }
              />
            ) : null}

            {result ? <ImportSummary result={result} /> : null}
            {result?.issues.length ? <IssuesTable issues={result.issues} /> : null}
            {result?.samples.length ? (
              <Table
                rowKey={(record, index) => `${record.row}-${index}`}
                className="dense-table"
                columns={sampleColumns}
                dataSource={result.samples}
                pagination={false}
                size="small"
              />
            ) : null}

            <Typography.Text type="secondary">
              Для клиентов нужны колонки: владелец, телефон, кличка. Для товаров: наименование, остаток, цена, склад.
            </Typography.Text>
          </Space>
        </div>
      </div>
    </div>
  );
}

function ImportSummary({ result }: { result: VetafImportResult }) {
  const summary = result.summary;
  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
      <Descriptions.Item label="Строк">{summary.totalRows}</Descriptions.Item>
      <Descriptions.Item label="Готово к импорту">{summary.validRows}</Descriptions.Item>
      <Descriptions.Item label="Ошибки">{summary.errorRows}</Descriptions.Item>
      <Descriptions.Item label="Режим">{result.mode === 'commit' ? 'Импорт выполнен' : 'Предпросмотр'}</Descriptions.Item>
      {result.kind === 'clients' ? (
        <>
          <Descriptions.Item label="Новые владельцы">{summary.ownersCreated}</Descriptions.Item>
          <Descriptions.Item label="Обновить владельцев">{summary.ownersUpdated}</Descriptions.Item>
          <Descriptions.Item label="Новые пациенты">{summary.animalsCreated}</Descriptions.Item>
        </>
      ) : (
        <>
          <Descriptions.Item label="Новые товары">{summary.productsCreated}</Descriptions.Item>
          <Descriptions.Item label="Обновить товары">{summary.productsUpdated}</Descriptions.Item>
          <Descriptions.Item label="Партии остатков">{summary.stockBatchesCreated}</Descriptions.Item>
        </>
      )}
    </Descriptions>
  );
}

function IssuesTable({ issues }: { issues: VetafImportIssue[] }) {
  return (
    <Table<VetafImportIssue>
      rowKey={(record, index) => `${record.rowNumber}-${record.field}-${index}`}
      className="dense-table"
      size="small"
      pagination={{ pageSize: 8 }}
      columns={[
        { title: 'Строка', dataIndex: 'rowNumber', key: 'rowNumber', width: 90 },
        {
          title: 'Тип',
          dataIndex: 'level',
          key: 'level',
          width: 120,
          render: (value: VetafImportIssue['level']) => <Tag color={value === 'error' ? 'red' : 'orange'}>{value === 'error' ? 'Ошибка' : 'Проверить'}</Tag>,
        },
        { title: 'Поле', dataIndex: 'field', key: 'field', width: 140, render: (value: string | undefined) => value || '—' },
        { title: 'Сообщение', dataIndex: 'message', key: 'message' },
      ]}
      dataSource={issues}
    />
  );
}

function buildSampleColumns(result: VetafImportResult | null): ColumnsType<Record<string, string | number | null>> {
  const keys = Object.keys(result?.samples[0] ?? {});
  return keys.map((key) => ({
    title: sampleColumnTitle(key),
    dataIndex: key,
    key,
    render: (value: string | number | null) => value ?? '—',
  }));
}

function sampleColumnTitle(key: string) {
  const titles: Record<string, string> = {
    row: 'Строка',
    owner: 'Владелец',
    phone: 'Телефон',
    animal: 'Пациент',
    product: 'Товар',
    quantity: 'Остаток',
    price: 'Цена',
  };
  return titles[key] ?? key;
}

function parseDelimitedTable(text: string): VetafImportRow[] {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) {
    throw new Error('Файл пустой');
  }

  const delimiter = detectDelimiter(normalizedText);
  const lines = normalizedText.split('\n').filter((line) => line.trim());
  const headers = parseDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  if (!headers.length) {
    throw new Error('В первой строке не найдены заголовки колонок');
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseDelimitedLine(line, delimiter);
    const data = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? '']));
    return { rowNumber: index + 2, data };
  });
}

function detectDelimiter(text: string) {
  const firstLine = text.split('\n')[0] ?? '';
  const candidates = [';', '\t', ','];
  return candidates
    .map((delimiter) => ({ delimiter, count: parseDelimitedLine(firstLine, delimiter).length }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

const clientTemplate = [
  'владелец;телефон;email;адрес;кличка;вид;порода;пол;дата рождения;микрочип;окрас;комментарий',
  'Иванов Иван;+7 900 000 00 00;client@example.ru;Армавир;Барсик;Кошка;Британская;самец;03.06.2022;643000000000000;серый;',
].join('\n');

const stockTemplate = [
  'наименование;категория;артикул;штрихкод;единица;остаток;цена продажи;закупочная цена;склад;срок годности;серия;минимальный остаток',
  'Шприц 5 мл;Расходники;S-5;4600000000000;шт;100;12;8;Основной склад;31.12.2027;A1;20',
].join('\n');
