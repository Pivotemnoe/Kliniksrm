import {
  DeleteOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  ImportOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Grid,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useRef, useState } from 'react';
import type { Row } from 'read-excel-file/browser';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  commitDataTransfer,
  DataTransferBatch,
  DataTransferKind,
  DataTransferMapping,
  DataTransferTargetField,
  getDataTransfers,
  previewDataTransfer,
  rollbackDataTransfer,
  VetafImportIssue,
  VetafImportRow,
} from './imports.api';

type ParsedFile = {
  fileName: string;
  checksum: string;
  columns: string[];
  rows: VetafImportRow[];
};

const kindOptions = [
  { label: 'Клиенты и пациенты', value: 'clients' },
  { label: 'История лечения', value: 'history' },
  { label: 'Товары и услуги', value: 'catalog' },
  { label: 'Остатки склада', value: 'stock' },
] satisfies Array<{ label: string; value: DataTransferKind }>;

const localTargetFields: Record<DataTransferKind, DataTransferTargetField[]> = {
  clients: fields([
    ['source_id', 'ID в прежней системе'], ['owner_source_id', 'ID владельца в прежней системе'],
    ['animal_source_id', 'ID пациента в прежней системе'], ['owner_name', 'ФИО владельца'], ['phone', 'Телефон'],
    ['extra_phone', 'Дополнительный телефон'], ['email', 'Email'],
    ['address', 'Адрес'], ['owner_comment', 'Комментарий владельца'], ['animal_name', 'Кличка пациента'], ['species', 'Вид'],
    ['animal_status', 'Статус пациента'], ['breed', 'Порода'], ['sex', 'Пол'], ['birth_date', 'Дата рождения'], ['microchip', 'Микрочип'],
    ['animal_comment', 'Комментарий пациента'], ['vaccination_title', 'Вакцинация'], ['vaccinated_at', 'Дата вакцинации'],
    ['vaccination_due_at', 'Следующая вакцинация'], ['vaccination_series', 'Серия вакцины'],
  ]),
  history: fields([
    ['source_id', 'ID записи в прежней системе'], ['owner_name', 'ФИО владельца'], ['phone', 'Телефон'],
    ['animal_name', 'Кличка пациента'], ['species', 'Вид'], ['breed', 'Порода'], ['microchip', 'Микрочип'],
    ['visit_date', 'Дата приёма', true], ['doctor', 'Врач'], ['visit_type', 'Тип приёма'], ['purpose', 'Причина обращения'],
    ['anamnesis', 'Анамнез'], ['examination', 'Осмотр'], ['symptoms', 'Симптомы'], ['manipulations', 'Манипуляции'],
    ['diagnosis', 'Диагноз'], ['diagnosis_description', 'Описание диагноза'], ['treatment_plan', 'Назначения'],
    ['care_notes', 'Рекомендации'], ['amount', 'Сумма счёта'], ['bill_status', 'Статус оплаты'],
    ['document_title', 'Название документа'], ['document_body', 'Текст документа'],
  ]),
  catalog: fields([
    ['source_id', 'ID в прежней системе'], ['item_type', 'Тип: товар или услуга'], ['title', 'Наименование', true],
    ['category', 'Категория'], ['sku', 'Артикул'], ['barcode', 'Штрихкод'], ['price', 'Цена'], ['unit', 'Единица'],
    ['min_stock', 'Минимальный остаток'], ['description', 'Описание'],
  ]),
  stock: fields([
    ['source_id', 'ID в прежней системе'], ['title', 'Наименование', true], ['category', 'Категория'], ['sku', 'Артикул'],
    ['barcode', 'Штрихкод'], ['unit', 'Единица'], ['quantity', 'Остаток', true], ['price', 'Цена продажи'],
    ['purchase_price', 'Закупочная цена'], ['min_stock', 'Минимальный остаток'], ['warehouse', 'Склад'],
    ['expires_at', 'Срок годности'], ['series', 'Серия'], ['description', 'Описание'],
  ]),
};

export function VetafImportPage() {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<DataTransferKind>('clients');
  const [sourceSystem, setSourceSystem] = useState('Другая система');
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<DataTransferBatch | null>(null);
  const transfersQuery = useQuery({ queryKey: ['data-transfers'], queryFn: getDataTransfers });
  const targetFields = transfersQuery.data?.targetFields[kind] ?? localTargetFields[kind];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['data-transfers'] });

  const previewMutation = useMutation({
    mutationFn: () => previewDataTransfer({
      kind,
      sourceSystem,
      fileName: parsedFile?.fileName ?? '',
      fileChecksum: parsedFile?.checksum ?? '',
      rows: parsedFile?.rows ?? [],
      mappings: toMappings(mapping),
    }),
    onSuccess: (batch) => {
      setResult(batch);
      refresh();
      message.success(batch.repeatProtected ? 'Этот файл уже был перенесён — повторная загрузка остановлена' : 'Файл проверен. Данные CRM пока не изменены');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const commitMutation = useMutation({
    mutationFn: (batchId: string) => commitDataTransfer(batchId),
    onSuccess: (batch) => {
      setResult(batch);
      refresh();
      message.success('Перенос завершён и записан в журнал');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const rollbackMutation = useMutation({
    mutationFn: (batchId: string) => rollbackDataTransfer(batchId),
    onSuccess: (batch) => {
      if (result?.id === batch.id) setResult(batch);
      refresh();
      message.success('Созданные этой партией записи отменены');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setResult(null);
    setParseError(null);
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ. Разделите перенос на несколько партий');
      const parsed = await parseImportFile(file);
      if (parsed.rows.length > 30_000) throw new Error('В файле больше 30 000 строк. Разделите перенос на несколько партий');
      const checksum = await sha256(file);
      const next = { fileName: file.name, checksum, ...parsed };
      setParsedFile(next);
      setMapping(autoMapColumns(kind, next.columns));
      message.success(`Файл прочитан: ${next.rows.length} строк`);
    } catch (error) {
      setParsedFile(null);
      setMapping({});
      setParseError(error instanceof Error ? error.message : 'Не удалось прочитать файл');
    }
  }

  function changeKind(nextKind: DataTransferKind) {
    setKind(nextKind);
    setResult(null);
    if (parsedFile) setMapping(autoMapColumns(nextKind, parsedFile.columns));
  }

  const mappingRows = useMemo(() => parsedFile?.columns.map((column) => ({ column, target: mapping[column] || '' })) ?? [], [parsedFile, mapping]);
  const missingRequired = targetFields.filter((field) => field.required && !Object.values(mapping).includes(field.value));
  const canPreview = Boolean(parsedFile?.rows.length && sourceSystem.trim() && toMappings(mapping).length && !missingRequired.length);
  const issues = [
    ...(result?.metadata?.issues ?? []),
    ...(result?.metadata?.commit?.errors ?? []),
  ];

  return (
    <div className="page">
      <PageHeader
        title="Перенос данных"
        description="Проверяемый перенос из Excel, CSV или TSV с защитой от дублей, журналом партий и безопасной отменой."
      />
      <Space direction="vertical" size={16} className="full-width">
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Сначала проверка, затем перенос"
          description="Проверка файла не меняет карточки клиники. Существующие записи не перезаписываются: система связывает найденные совпадения и создаёт только отсутствующие данные."
        />
        <Card title="1. Файл и раздел">
          <Space direction="vertical" size={14} className="full-width">
            {screens.md ? (
              <Segmented<DataTransferKind> block value={kind} options={kindOptions} onChange={changeKind} />
            ) : (
              <Select<DataTransferKind>
                aria-label="Раздел переносимых данных"
                value={kind}
                options={kindOptions}
                onChange={changeKind}
                style={{ width: '100%' }}
              />
            )}
            <Space wrap>
              <Input
                value={sourceSystem}
                onChange={(event) => setSourceSystem(event.target.value)}
                placeholder="Откуда переносим"
                style={{ width: 260 }}
                maxLength={120}
              />
              <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(kind)}>Скачать шаблон</Button>
              <Button icon={<ImportOutlined />} onClick={() => inputRef.current?.click()}>Выбрать файл</Button>
              <input ref={inputRef} type="file" accept=".xlsx,.csv,.tsv,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
            </Space>
            {parseError ? <Alert type="error" showIcon message={parseError} /> : null}
            {parsedFile ? (
              <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
                <Descriptions.Item label="Файл">{parsedFile.fileName}</Descriptions.Item>
                <Descriptions.Item label="Строк">{parsedFile.rows.length}</Descriptions.Item>
                <Descriptions.Item label="Контрольная сумма">{parsedFile.checksum.slice(0, 12)}</Descriptions.Item>
              </Descriptions>
            ) : null}
          </Space>
        </Card>

        {parsedFile ? (
          <Card title="2. Сопоставление колонок">
            <Table
              rowKey="column"
              size="small"
              pagination={false}
              scroll={{ x: 640 }}
              dataSource={mappingRows}
              columns={[
                { title: 'Колонка файла', dataIndex: 'column', key: 'column' },
                {
                  title: 'Поле TemichevVet',
                  dataIndex: 'target',
                  key: 'target',
                  render: (_value, record) => (
                    <Select
                      allowClear
                      showSearch
                      value={mapping[record.column] || undefined}
                      placeholder="Не переносить"
                      style={{ width: '100%' }}
                      options={targetFields.map((field) => ({
                        value: field.value,
                        label: `${field.label}${field.required ? ' *' : ''}`,
                        disabled: Object.entries(mapping).some(([column, target]) => column !== record.column && target === field.value),
                      }))}
                      onChange={(target) => setMapping((current) => ({ ...current, [record.column]: target || '' }))}
                    />
                  ),
                },
              ]}
            />
            <Space direction="vertical" size={8} className="full-width" style={{ marginTop: 16 }}>
              {missingRequired.length ? <Alert type="warning" showIcon message={`Нужно сопоставить: ${missingRequired.map((field) => field.label).join(', ')}`} /> : null}
              <Button
                type="primary"
                icon={<FileSearchOutlined />}
                disabled={!canPreview}
                loading={previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                Проверить файл без записи
              </Button>
            </Space>
          </Card>
        ) : null}

        {result ? (
          <Card title="3. Результат проверки">
            {result.repeatProtected ? <Alert type="warning" showIcon message="Повторный перенос остановлен" description="Партия с такой контрольной суммой уже есть в журнале." style={{ marginBottom: 16 }} /> : null}
            {result.errorSummary ? <Alert type="error" showIcon message="Часть строк не перенесена" description="Скачайте журнал ошибок, исправьте исходный файл и выполните новую проверку." style={{ marginBottom: 16 }} /> : null}
            <TransferSummary batch={result} />
            {issues.length ? <IssuesTable issues={issues} /> : null}
            {result.metadata?.samples?.length ? <PreviewSamples samples={result.metadata.samples} targetFields={targetFields} /> : null}
            <Space wrap style={{ marginTop: 16 }}>
              {issues.length ? <Button icon={<DownloadOutlined />} onClick={() => downloadIssues(issues, result)}>Скачать журнал ошибок</Button> : null}
              <Button
                type="primary"
                icon={<ImportOutlined />}
                disabled={!result.canCommit || result.readyRows === 0 || result.repeatProtected}
                loading={commitMutation.isPending}
                onClick={() => commitMutation.mutate(result.id)}
              >
                Перенести {result.readyRows} строк
              </Button>
              {result.canRollback ? (
                <Popconfirm
                  title="Отменить эту партию?"
                  description="Будут удалены только записи, созданные этой партией. Если ими уже пользовались, отмена остановится."
                  okText="Отменить партию"
                  cancelText="Не отменять"
                  onConfirm={() => rollbackMutation.mutate(result.id)}
                >
                  <Button danger icon={<DeleteOutlined />} loading={rollbackMutation.isPending}>Отменить эту партию</Button>
                </Popconfirm>
              ) : null}
            </Space>
          </Card>
        ) : null}

        <Card title="Журнал переноса">
          <Table<DataTransferBatch>
            rowKey="id"
            loading={transfersQuery.isLoading}
            dataSource={transfersQuery.data?.batches ?? []}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 960 }}
            columns={[
              { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => formatDate(value) },
              { title: 'Источник', dataIndex: 'sourceSystem', key: 'sourceSystem' },
              { title: 'Раздел', dataIndex: 'kind', key: 'kind', render: (value: DataTransferKind) => kindOptions.find((option) => option.value === value)?.label ?? value },
              { title: 'Файл', dataIndex: 'originalFileName', key: 'originalFileName', render: (value: string | null) => value || '—' },
              { title: 'Строк', dataIndex: 'totalRows', key: 'totalRows', width: 80 },
              { title: 'Статус', dataIndex: 'status', key: 'status', render: (value: string) => <TransferStatus status={value} /> },
              {
                title: '',
                key: 'actions',
                render: (_, batch) => (
                  <Space>
                    <Button size="small" onClick={() => setResult(batch)}>Открыть</Button>
                    {batch.canRollback ? (
                      <Popconfirm title="Отменить эту партию?" okText="Да" cancelText="Нет" onConfirm={() => rollbackMutation.mutate(batch.id)}>
                        <Button danger size="small">Отменить</Button>
                      </Popconfirm>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}

function TransferSummary({ batch }: { batch: DataTransferBatch }) {
  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
      <Descriptions.Item label="Всего строк">{batch.totalRows}</Descriptions.Item>
      <Descriptions.Item label="Готово">{batch.readyRows}</Descriptions.Item>
      <Descriptions.Item label="Пропущено">{batch.skippedRows}</Descriptions.Item>
      <Descriptions.Item label="Ошибки выполнения">{batch.failedRows}</Descriptions.Item>
      <Descriptions.Item label="Перенесено">{batch.importedRows}</Descriptions.Item>
      <Descriptions.Item label="Статус"><TransferStatus status={batch.status} /></Descriptions.Item>
      {batch.metadata?.preview ? (
        <>
          <Descriptions.Item label="Совпадений найдено заранее">{batch.metadata.preview.matchedRecords ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Повторных строк пропущено">{batch.metadata.preview.repeatedRows ?? 0}</Descriptions.Item>
        </>
      ) : null}
      {batch.metadata?.commit ? (
        <>
          <Descriptions.Item label="Создано записей">{batch.metadata.commit.createdRecords ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Найдено совпадений">{batch.metadata.commit.matchedRecords ?? 0}</Descriptions.Item>
        </>
      ) : null}
    </Descriptions>
  );
}

function TransferStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    PREVIEWED: { color: 'blue', label: 'Проверено' },
    IMPORTING: { color: 'processing', label: 'Переносится' },
    COMPLETED: { color: 'green', label: 'Перенесено' },
    COMPLETED_WITH_ERRORS: { color: 'orange', label: 'Перенесено с ошибками' },
    ROLLING_BACK: { color: 'processing', label: 'Отменяется' },
    ROLLED_BACK: { color: 'default', label: 'Отменено' },
    ROLLBACK_BLOCKED: { color: 'red', label: 'Отмена остановлена' },
    FAILED: { color: 'red', label: 'Ошибка' },
  };
  const item = map[status] ?? { color: 'default', label: status };
  return <Tag color={item.color}>{item.label}</Tag>;
}

function IssuesTable({ issues }: { issues: VetafImportIssue[] }) {
  return (
    <Table<VetafImportIssue>
      rowKey={(record, index) => `${record.rowNumber}-${record.field}-${index}`}
      size="small"
      pagination={{ pageSize: 8 }}
      style={{ marginTop: 16 }}
      columns={[
        { title: 'Строка', dataIndex: 'rowNumber', key: 'rowNumber', width: 90 },
        { title: 'Тип', dataIndex: 'level', key: 'level', width: 120, render: (value: VetafImportIssue['level']) => <Tag color={value === 'error' ? 'red' : 'orange'}>{value === 'error' ? 'Ошибка' : 'Проверить'}</Tag> },
        { title: 'Поле', dataIndex: 'field', key: 'field', width: 160, render: (value?: string) => value || '—' },
        { title: 'Сообщение', dataIndex: 'message', key: 'message' },
      ]}
      dataSource={issues}
    />
  );
}

function PreviewSamples({
  samples,
  targetFields,
}: {
  samples: Array<Record<string, string | number | null>>;
  targetFields: DataTransferTargetField[];
}) {
  const keys = [...new Set(samples.flatMap((sample) => Object.keys(sample)))];
  const labels = new Map(targetFields.map((field) => [field.value, field.label]));
  return (
    <div style={{ marginTop: 20 }}>
      <Typography.Title level={5}>Предпросмотр первых строк</Typography.Title>
      <Table
        rowKey={(record, index) => String(record.row ?? index)}
        size="small"
        pagination={false}
        scroll={{ x: Math.max(760, keys.length * 180) }}
        dataSource={samples}
        columns={keys.map((key) => ({
          title: key === 'row' ? 'Строка' : labels.get(key) ?? key,
          dataIndex: key,
          key,
          width: key === 'row' ? 90 : 180,
          ellipsis: true,
          render: (value: string | number | null) => value === null || value === '' ? '—' : String(value),
        }))}
      />
    </div>
  );
}

async function parseImportFile(file: File): Promise<{ columns: string[]; rows: VetafImportRow[] }> {
  if (/\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const { readSheet } = await import('read-excel-file/browser');
    return parseSpreadsheetTable(await readSheet(file));
  }
  return parseDelimitedTable(await file.text());
}

function parseSpreadsheetTable(sheetRows: Row[]) {
  const table = sheetRows.map((row) => row.map(cellToText));
  const headerIndex = findHeaderRow(table);
  const headers = buildHeaders(table[headerIndex]);
  if (!headers.length) throw new Error('В Excel не найдены заголовки колонок');
  const rows: VetafImportRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < table.length; rowIndex += 1) {
    const data = Object.fromEntries(headers.map(({ index, title }) => [title, table[rowIndex]?.[index]?.trim() ?? '']));
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber: rowIndex + 1, data });
  }
  if (!rows.length) throw new Error('После заголовков нет строк данных');
  return { columns: headers.map((header) => header.title), rows };
}

function parseDelimitedTable(text: string) {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) throw new Error('Файл пустой');
  const delimiter = detectDelimiter(normalizedText);
  const table = parseDelimitedRows(normalizedText, delimiter).filter((row) => row.some((cell) => cell.trim()));
  const columns = uniqueHeaders((table[0] ?? []).map((header) => header.trim()));
  const rows = table.slice(1).map((cells, index) => {
    return { rowNumber: index + 2, data: Object.fromEntries(columns.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ''])) };
  });
  if (!rows.length) throw new Error('После заголовков нет строк данных');
  return { columns, rows };
}

function findHeaderRow(rows: string[][]) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 100).forEach((row, index) => {
    const score = row.filter((cell) => knownAliases.has(normalizeHeader(cell))).length;
    if (score > best.score) best = { index, score };
  });
  if (best.index < 0 || best.score < 1) throw new Error('Не удалось найти строку с заголовками');
  return best.index;
}

function buildHeaders(row: string[]) {
  return uniqueHeaders(row.map((title) => title.trim())).map((title, index) => ({ index, title })).filter((item) => item.title);
}

function uniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    if (!header) return header;
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count ? `${header} ${count + 1}` : header;
  });
}

function autoMapColumns(kind: DataTransferKind, columns: string[]) {
  const allowed = new Set(localTargetFields[kind].map((field) => field.value));
  const used = new Set<string>();
  return Object.fromEntries(columns.map((column) => {
    const target = aliasTargets[normalizeHeader(column)] || '';
    if (!allowed.has(target) || used.has(target)) return [column, ''];
    used.add(target);
    return [column, target];
  }));
}

function toMappings(mapping: Record<string, string>): DataTransferMapping[] {
  return Object.entries(mapping).filter(([, targetField]) => targetField).map(([sourceColumn, targetField]) => ({ sourceColumn, targetField }));
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadTemplate(kind: DataTransferKind) {
  const blob = new Blob([templates[kind]], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `temichevvet-transfer-${kind}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadIssues(issues: VetafImportIssue[], batch: DataTransferBatch) {
  const rows = [
    ['Строка', 'Тип', 'Поле', 'Сообщение'],
    ...issues.map((issue) => [String(issue.rowNumber), issue.level === 'error' ? 'Ошибка' : 'Проверить', issue.field || '', issue.message]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `temichevvet-transfer-errors-${batch.id.slice(0, 8)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function cellToText(value: Row[number]) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${String(value.getDate()).padStart(2, '0')}.${String(value.getMonth() + 1).padStart(2, '0')}.${value.getFullYear()}`;
  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
}

function detectDelimiter(text: string) {
  const firstLine = text.split('\n')[0] ?? '';
  return [';', '\t', ','].map((delimiter) => ({ delimiter, count: parseDelimitedLine(firstLine, delimiter).length })).sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimitedLine(line: string, delimiter: string) {
  return parseDelimitedRows(line, delimiter)[0] ?? [];
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { current += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(current); current = ''; continue; }
    if (char === '\n' && !quoted) { row.push(current); rows.push(row); row = []; current = ''; continue; }
    current += char;
  }
  if (quoted) throw new Error('В CSV/TSV есть незакрытая кавычка');
  row.push(current);
  rows.push(row);
  return rows;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function fields(items: Array<[string, string, boolean?]>): DataTransferTargetField[] {
  return items.map(([value, label, required]) => ({ value, label, required }));
}

const aliasTargets: Record<string, string> = {
  id: 'source_id', sourceid: 'source_id', внешнийid: 'source_id',
  idвладельца: 'owner_source_id', idвладельцавпрежнейсистеме: 'owner_source_id', ownersourceid: 'owner_source_id',
  idпациента: 'animal_source_id', idпациентавпрежнейсистеме: 'animal_source_id', animalsourceid: 'animal_source_id',
  владелец: 'owner_name', фио: 'owner_name', фиовладельца: 'owner_name', клиент: 'owner_name',
  телефон: 'phone', мобильный: 'phone', phone: 'phone',
  доптелефон: 'extra_phone', дополнительныйтелефон: 'extra_phone', extraphone: 'extra_phone',
  email: 'email', почта: 'email', адрес: 'address',
  кличка: 'animal_name', пациент: 'animal_name', животное: 'animal_name', вид: 'species', порода: 'breed',
  статуспациента: 'animal_status', статусживотного: 'animal_status', animalstatus: 'animal_status',
  пол: 'sex', датарождения: 'birth_date', микрочип: 'microchip', чип: 'microchip',
  вакцинация: 'vaccination_title', вакцина: 'vaccination_title', датавакцинации: 'vaccinated_at', следующаявакцинация: 'vaccination_due_at', сериявакцины: 'vaccination_series',
  датаприема: 'visit_date', прием: 'visit_date', врач: 'doctor', типприема: 'visit_type', причинаобращения: 'purpose',
  анамнез: 'anamnesis', осмотр: 'examination', симптомы: 'symptoms', манипуляции: 'manipulations', диагноз: 'diagnosis',
  описаниедиагноза: 'diagnosis_description', назначения: 'treatment_plan', рекомендации: 'care_notes', суммасчета: 'amount', статусоплаты: 'bill_status',
  тип: 'item_type', типпозиции: 'item_type', наименование: 'title', название: 'title', товар: 'title', категория: 'category',
  артикул: 'sku', штрихкод: 'barcode', цена: 'price', ценапродажи: 'price', единица: 'unit', минимальныйостаток: 'min_stock',
  остаток: 'quantity', количество: 'quantity', закупочнаяцена: 'purchase_price', склад: 'warehouse', срокгодности: 'expires_at', серия: 'series', описание: 'description',
};

const knownAliases = new Set(Object.keys(aliasTargets));

const templates: Record<DataTransferKind, string> = {
  clients: 'id;id владельца;id пациента;владелец;телефон;дополнительный телефон;email;адрес;кличка;вид;статус пациента;порода;пол;дата рождения;микрочип;вакцинация;дата вакцинации;следующая вакцинация\nстрока-1;владелец-1;пациент-1;Иванов Иван;+7 900 000 00 00;;client@example.ru;Армавир;Барсик;Кошка;Здоров;Британская;самец;03.06.2022;643000000000000;Бешенство;01.07.2026;01.07.2027',
  history: 'владелец;телефон;кличка;вид;дата приёма;врач;тип приёма;причина обращения;анамнез;осмотр;диагноз;назначения;сумма счёта;статус оплаты\nИванов Иван;+7 900 000 00 00;Барсик;Кошка;24.07.2026 10:30;Петров Пётр;первичный;вялость;со слов владельца;осмотр проведён;Предварительный диагноз;Рекомендации;1500;оплачен',
  catalog: 'тип позиции;наименование;категория;артикул;штрихкод;цена;единица;минимальный остаток;описание\nтовар;Шприц 5 мл;Расходники;S-5;4600000000000;12;шт;20;\nуслуга;Первичный приём;Приёмы;;;1500;;;',
  stock: 'наименование;категория;артикул;штрихкод;единица;остаток;цена продажи;закупочная цена;склад;срок годности;серия;минимальный остаток\nШприц 5 мл;Расходники;S-5;4600000000000;шт;100;12;8;Основной склад;31.12.2027;A1;20',
};
