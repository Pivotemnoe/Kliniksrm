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
import { ApiError, getErrorMessage } from '../../api/errors';
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
} from './imports.api';
import {
  ColumnMappingSuggestion,
  ParsedImportFile,
  parseImportFile,
  prepareTransferPayload,
  suggestColumnMappings,
} from './import-file-parser';

type ParsedFile = ParsedImportFile & {
  fileName: string;
  checksum: string;
};

type PreviewTransferBody = Parameters<typeof previewDataTransfer>[0];

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
    ['category', 'Категория'], ['sku', 'Артикул'], ['barcode', 'Штрихкод'], ['price', 'Цена'], ['minimum_price', 'Минимальная цена'],
    ['price_type', 'Тип цены'], ['unit', 'Единица'], ['min_stock', 'Минимальный остаток'], ['description', 'Описание'], ['price_note', 'Цена в исходном файле'],
    ['review_status', 'Отметка «требует проверки»'],
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
  const [mappingSuggestions, setMappingSuggestions] = useState<Record<string, ColumnMappingSuggestion>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<DataTransferBatch | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const transfersQuery = useQuery({ queryKey: ['data-transfers'], queryFn: getDataTransfers });
  const transferLoadError = describeTransferLoadError(transfersQuery.error);
  const targetFields = transfersQuery.data?.targetFields[kind] ?? localTargetFields[kind];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['data-transfers'] });

  const previewMutation = useMutation({
    mutationFn: (body: PreviewTransferBody) => previewDataTransfer(body),
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
    setAdvancedOpen(false);
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Файл больше 15 МБ. Разделите перенос на несколько партий');
      const parsed = await parseImportFile(file);
      if (parsed.rows.length > 30_000) throw new Error('В файле больше 30 000 строк. Разделите перенос на несколько партий');
      const checksum = await sha256(file);
      const next = { fileName: file.name, checksum, ...parsed };
      const nextKind = parsed.detectedKind ?? kind;
      const suggestions = suggestColumnMappings(nextKind, next.columns, next.rows);
      const nextMapping = Object.fromEntries(suggestions.map((item) => [item.sourceColumn, item.targetField]));
      setKind(nextKind);
      setParsedFile(next);
      setMapping(nextMapping);
      setMappingSuggestions(Object.fromEntries(suggestions.map((item) => [item.sourceColumn, item])));
      if (next.blockedReason) {
        message.warning('Выбран контрольный отчёт. Перенос заблокирован');
        return;
      }
      const problems = mappingProblems(nextKind, nextMapping, localTargetFields[nextKind]);
      if (!parsed.detectedKind || problems.length) {
        setAdvancedOpen(true);
        message.warning('Файл прочитан, но для безопасной проверки нужны уточнения');
        return;
      }
      const prepared = prepareTransferPayload(nextKind, next.rows, nextMapping);
      message.success(`Файл распознан: ${next.rows.length} строк. Запускаю безопасную проверку`);
      previewMutation.mutate({
        kind: nextKind,
        sourceSystem: sourceSystem.trim() || 'Другая система',
        fileName: next.fileName,
        fileChecksum: next.checksum,
        rows: prepared.rows,
        mappings: prepared.mappings,
      });
    } catch (error) {
      setParsedFile(null);
      setMapping({});
      setMappingSuggestions({});
      setParseError(error instanceof Error ? error.message : 'Не удалось прочитать файл');
    }
  }

  function changeKind(nextKind: DataTransferKind) {
    setKind(nextKind);
    setResult(null);
    if (parsedFile) {
      const suggestions = suggestColumnMappings(nextKind, parsedFile.columns, parsedFile.rows);
      setMapping(Object.fromEntries(suggestions.map((item) => [item.sourceColumn, item.targetField])));
      setMappingSuggestions(Object.fromEntries(suggestions.map((item) => [item.sourceColumn, item])));
    }
  }

  function runPreview() {
    if (!parsedFile || !canPreview) return;
    const prepared = prepareTransferPayload(kind, parsedFile.rows, mapping);
    setResult(null);
    previewMutation.mutate({
      kind,
      sourceSystem: sourceSystem.trim(),
      fileName: parsedFile.fileName,
      fileChecksum: parsedFile.checksum,
      rows: prepared.rows,
      mappings: prepared.mappings,
    });
  }

  const mappingRows = useMemo(() => parsedFile?.columns.map((column) => ({ column, target: mapping[column] || '', suggestion: mappingSuggestions[column] })) ?? [], [parsedFile, mapping, mappingSuggestions]);
  const problems = mappingProblems(kind, mapping, targetFields);
  const canPreview = Boolean(parsedFile?.rows.length && !parsedFile.blockedReason && sourceSystem.trim() && toMappings(mapping).length && !problems.length);
  const issues = [
    ...(result?.metadata?.issues ?? []),
    ...(result?.metadata?.commit?.errors ?? []),
  ];
  const resultBlocked = isControlReportFileName(result?.originalFileName);
  const resultFinished = Boolean(result && ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(result.status));
  const resultAlreadyImported = Boolean(result?.repeatProtected || resultFinished);
  const canCommitResult = Boolean(result?.canCommit && result.readyRows > 0 && !resultAlreadyImported && !resultBlocked);

  return (
    <div className="page">
      <PageHeader
        title="Перенос данных"
        description="Загрузите файл — CRM сама определит данные, проверит дубли и покажет итог до записи в базу."
      />
      <Space direction="vertical" size={16} className="full-width">
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Проверка безопасна"
          description="Выбор файла не меняет базу. Существующие карточки не перезаписываются, а запись начнётся только после отдельного подтверждения."
        />
        {transfersQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message={transferLoadError.message}
            description={transferLoadError.description}
            action={<Button onClick={() => transfersQuery.refetch()}>Повторить</Button>}
          />
        ) : null}
        <Card title="Загрузите файл">
          <Space direction="vertical" size={14} className="full-width">
            <Space wrap>
              <Button type="primary" size="large" icon={<ImportOutlined />} onClick={() => inputRef.current?.click()}>Выбрать файл</Button>
              <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(kind)}>Скачать пустой шаблон</Button>
              <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
            </Space>
            <Typography.Text type="secondary">
              «Выбрать файл» открывает готовый файл с компьютера или флешки. Пустой шаблон нужен только для подготовки нового переноса.
            </Typography.Text>
            {parseError ? <Alert type="error" showIcon message={parseError} /> : null}
            {parsedFile ? (
              <>
                <Descriptions bordered size="small" column={{ xs: 1, md: 4 }}>
                <Descriptions.Item label="Файл">{parsedFile.fileName}</Descriptions.Item>
                <Descriptions.Item label="Формат">{parsedFile.formatLabel}</Descriptions.Item>
                <Descriptions.Item label="Строк">{parsedFile.rows.length.toLocaleString('ru-RU')}</Descriptions.Item>
                {parsedFile.sheetName ? <Descriptions.Item label="Лист Excel">{parsedFile.sheetName}</Descriptions.Item> : null}
                </Descriptions>
                {parsedFile.blockedReason ? (
                  <Alert style={{ marginTop: 12 }} type="error" showIcon message="Этот файл не нужно добавлять в CRM" description={parsedFile.blockedReason} />
                ) : (
                  <Alert
                    style={{ marginTop: 12 }}
                    type={parsedFile.detectedKind && !problems.length ? 'success' : 'warning'}
                    showIcon
                    message={parsedFile.detectedKind ? `Файл распознан: ${kindOptions.find((option) => option.value === parsedFile.detectedKind)?.label}` : 'Содержимое не распознано однозначно'}
                    description={previewMutation.isPending ? 'Идёт автоматическая проверка. Данные в базу не записываются.' : problems.length ? `Нужно уточнить: ${problems.join(', ')}.` : 'Колонки определены автоматически.'}
                  />
                )}
                {parsedFile.warnings.map((warning) => <Alert key={warning} style={{ marginTop: 12 }} type="info" showIcon message={warning} />)}
                {!parsedFile.blockedReason ? <Button type="link" onClick={() => setAdvancedOpen((current) => !current)}>{advancedOpen ? 'Скрыть дополнительные настройки' : 'Дополнительные настройки'}</Button> : null}
              </>
            ) : null}
          </Space>
        </Card>

        {parsedFile && advancedOpen && !parsedFile.blockedReason ? (
          <Card title="Дополнительные настройки">
            <Space direction="vertical" size={12} className="full-width" style={{ marginBottom: 16 }}>
              {screens.md ? (
                <Segmented<DataTransferKind> block value={kind} options={kindOptions} onChange={changeKind} />
              ) : (
                <Select<DataTransferKind> aria-label="Раздел переноса" value={kind} options={kindOptions} onChange={changeKind} style={{ width: '100%' }} />
              )}
              <Input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder="Источник данных" maxLength={120} />
            </Space>
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
                      onChange={(target) => {
                        const targetField = target || '';
                        setMapping((current) => ({ ...current, [record.column]: targetField }));
                        setMappingSuggestions((current) => ({
                          ...current,
                          [record.column]: {
                            sourceColumn: record.column,
                            targetField,
                            confidence: targetField ? 1 : 0,
                            reason: targetField ? 'Выбрано вручную' : 'Колонка исключена вручную',
                          },
                        }));
                      }}
                    />
                  ),
                },
                {
                  title: 'Распознавание',
                  key: 'confidence',
                  width: 190,
                  render: (_value, record) => <MappingConfidence suggestion={record.suggestion} mapped={Boolean(record.target)} />,
                },
              ]}
            />
            <Space direction="vertical" size={8} className="full-width" style={{ marginTop: 16 }}>
              {problems.length ? <Alert type="warning" showIcon message={`Нужно уточнить: ${problems.join(', ')}`} /> : null}
              <Button
                type="primary"
                icon={<FileSearchOutlined />}
                disabled={!canPreview}
                loading={previewMutation.isPending}
                onClick={runPreview}
              >
                Повторить проверку
              </Button>
            </Space>
          </Card>
        ) : null}

        {result ? (
          <Card title="Результат проверки">
            {resultBlocked ? <Alert type="error" showIcon message="Контрольный отчёт нельзя добавить в базу" description="Выберите файл с карточками клиентов и пациентов." style={{ marginBottom: 16 }} /> : null}
            {resultAlreadyImported && !resultBlocked ? (
              <Alert
                type={result.status === 'COMPLETED_WITH_ERRORS' ? 'warning' : 'success'}
                showIcon
                message="Перенос уже завершён"
                description={`В базу уже добавлено ${result.importedRows.toLocaleString('ru-RU')} строк. Повторно добавлять этот файл не нужно.`}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            {!resultAlreadyImported && !resultBlocked ? (
              <Alert
                type={canCommitResult ? 'success' : 'warning'}
                showIcon
                message={canCommitResult ? 'Файл проверен и готов к добавлению' : 'Файл пока нельзя добавить'}
                description={canCommitResult ? `CRM добавит ${result.readyRows.toLocaleString('ru-RU')} ${importTargetLabel(result.kind)}. Найденные карточки не будут дублироваться.` : 'Посмотрите сводку и исправьте блокирующие ошибки.'}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <TransferSummary batch={result} />
            <Space wrap style={{ marginTop: 16 }}>
              {!resultAlreadyImported && !resultBlocked ? (
                <Popconfirm
                  title="Добавить данные в базу?"
                  description="CRM создаст только отсутствующие записи. Существующие карточки не будут перезаписаны."
                  okText="Добавить в базу"
                  cancelText="Отмена"
                  onConfirm={() => commitMutation.mutate(result.id)}
                  disabled={!canCommitResult}
                >
                  <Button type="primary" size="large" icon={<ImportOutlined />} disabled={!canCommitResult} loading={commitMutation.isPending}>
                    Добавить в базу {result.readyRows.toLocaleString('ru-RU')} {importTargetLabel(result.kind)}
                  </Button>
                </Popconfirm>
              ) : null}
              {issues.length ? <Button icon={<DownloadOutlined />} onClick={() => downloadIssues(issues, result)}>Скачать список проблемных строк</Button> : null}
              {(issues.length || result.metadata?.samples?.length) ? <Button onClick={() => setAdvancedOpen((current) => !current)}>{advancedOpen ? 'Скрыть подробности' : 'Показать подробности'}</Button> : null}
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
            {advancedOpen && issues.length ? <IssuesTable issues={issues} /> : null}
            {advancedOpen && result.metadata?.samples?.length ? <PreviewSamples samples={result.metadata.samples} targetFields={targetFields} /> : null}
          </Card>
        ) : null}

        <Card title="Журнал переноса">
          <Table<DataTransferBatch>
            rowKey="id"
            loading={transfersQuery.isLoading}
            dataSource={transfersQuery.data?.batches ?? []}
            locale={{ emptyText: 'Переносов пока нет. Выберите файл выше, чтобы начать проверку.' }}
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
  const matchedByType = batch.metadata?.preview?.matchedByType ?? {};
  const sourceEntitiesByType = batch.metadata?.preview?.sourceEntitiesByType ?? {};
  const transferFinished = batch.repeatProtected || ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(batch.status);
  const readyNow = transferFinished ? 0 : batch.readyRows;
  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
      <Descriptions.Item label="Всего строк">{batch.totalRows.toLocaleString('ru-RU')}</Descriptions.Item>
      <Descriptions.Item label="Можно добавить сейчас">{readyNow.toLocaleString('ru-RU')}</Descriptions.Item>
      <Descriptions.Item label="Не будут добавлены">{batch.skippedRows.toLocaleString('ru-RU')}</Descriptions.Item>
      <Descriptions.Item label="Ошибки при добавлении">{batch.failedRows.toLocaleString('ru-RU')}</Descriptions.Item>
      <Descriptions.Item label="Уже добавлено">{batch.importedRows.toLocaleString('ru-RU')}</Descriptions.Item>
      <Descriptions.Item label="Статус"><TransferStatus status={batch.status} /></Descriptions.Item>
      {batch.kind === 'clients' ? (
        <>
          {sourceEntitiesByType.owners ? <Descriptions.Item label="Владельцев в файле">{sourceEntitiesByType.owners.toLocaleString('ru-RU')}</Descriptions.Item> : null}
          {sourceEntitiesByType.animals ? <Descriptions.Item label="Пациентов в файле">{sourceEntitiesByType.animals.toLocaleString('ru-RU')}</Descriptions.Item> : null}
          {typeof matchedByType.owners === 'number' ? <Descriptions.Item label="Строк, где владелец уже найден">{matchedByType.owners.toLocaleString('ru-RU')}</Descriptions.Item> : null}
          {typeof matchedByType.animals === 'number' ? <Descriptions.Item label="Строк, где пациент уже найден">{matchedByType.animals.toLocaleString('ru-RU')}</Descriptions.Item> : null}
        </>
      ) : null}
      {batch.metadata?.preview ? (
        <>
          {batch.kind !== 'clients' ? <Descriptions.Item label="Совпадений уже найдено">{(batch.metadata.preview.matchedRecords ?? 0).toLocaleString('ru-RU')}</Descriptions.Item> : null}
          <Descriptions.Item label="Повторных строк в файле">{(batch.metadata.preview.repeatedRows ?? 0).toLocaleString('ru-RU')}</Descriptions.Item>
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

function MappingConfidence({ suggestion, mapped }: { suggestion?: ColumnMappingSuggestion; mapped: boolean }) {
  if (!suggestion || !mapped) return <Tag>Не переносить</Tag>;
  if (suggestion.reason.includes('вручную')) return <Tag color="blue">Выбрано вручную</Tag>;
  if (suggestion.confidence >= 0.9) return <Tag color="green">Высокая уверенность</Tag>;
  if (suggestion.confidence >= 0.72) return <Tag color="gold">Нужно проверить</Tag>;
  return <Tag color="orange">Низкая уверенность</Tag>;
}

function toMappings(mapping: Record<string, string>): DataTransferMapping[] {
  return Object.entries(mapping).filter(([, targetField]) => targetField).map(([sourceColumn, targetField]) => ({ sourceColumn, targetField }));
}

function mappingProblems(
  kind: DataTransferKind,
  mapping: Record<string, string>,
  targetFields: DataTransferTargetField[],
) {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const problems = targetFields.filter((field) => field.required && !mapped.has(field.value)).map((field) => field.label);
  if (kind === 'clients' && !mapped.has('owner_name') && !mapped.has('phone')) problems.push('ФИО владельца или телефон');
  return problems;
}

function isControlReportFileName(fileName?: string | null) {
  const normalized = (fileName ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return normalized.includes('проверк') && (normalized.includes('клиент') || normalized.includes('пациент') || normalized.includes('свод'));
}

function importTargetLabel(kind: DataTransferKind) {
  if (kind === 'clients') return 'записей владельцев и пациентов';
  if (kind === 'history') return 'записей истории лечения';
  if (kind === 'catalog') return 'товаров и услуг';
  return 'складских остатков';
}

function describeTransferLoadError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return {
      message: 'Нужно войти в CRM',
      description: 'Сессия сотрудника закончилась. Откройте страницу входа и войдите снова.',
    };
  }

  if (error instanceof ApiError && error.status === 404) {
    return {
      message: 'Модуль переноса ещё не загружен',
      description: 'На этом компьютере запущена более ранняя версия сервера CRM.',
    };
  }

  return {
    message: 'Не удалось загрузить журнал переноса',
    description: getErrorMessage(error),
  };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadTemplate(kind: DataTransferKind) {
  const contents = `\uFEFF${templates[kind].replace(/\r?\n/g, '\r\n')}`;
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `temichevvet-transfer-${kind}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function fields(items: Array<[string, string, boolean?]>): DataTransferTargetField[] {
  return items.map(([value, label, required]) => ({ value, label, required }));
}

const templates: Record<DataTransferKind, string> = {
  clients: 'id;id владельца;id пациента;владелец;телефон;дополнительный телефон;email;адрес;кличка;вид;статус пациента;порода;пол;дата рождения;микрочип;вакцинация;дата вакцинации;следующая вакцинация\nстрока-1;владелец-1;пациент-1;Иванов Иван;+7 900 000 00 00;;client@example.ru;Армавир;Барсик;Кошка;Здоров;Британская;самец;03.06.2022;643000000000000;Бешенство;01.07.2026;01.07.2027',
  history: 'владелец;телефон;кличка;вид;дата приёма;врач;тип приёма;причина обращения;анамнез;осмотр;диагноз;назначения;сумма счёта;статус оплаты\nИванов Иван;+7 900 000 00 00;Барсик;Кошка;24.07.2026 10:30;Петров Пётр;первичный;вялость;со слов владельца;осмотр проведён;Предварительный диагноз;Рекомендации;1500;оплачен',
  catalog: 'тип позиции;наименование;категория;артикул;штрихкод;цена;минимальная цена;тип цены;единица;минимальный остаток;описание;исходная цена\nтовар;Шприц 5 мл;Расходники;S-5;4600000000000;12;;Фиксированная;шт;20;;\nуслуга;Первичный приём;Приёмы;;;1500;;Фиксированная;;;;\nуслуга;Сложная перевязка;Процедуры;;;;;Плавающая;;;Цена зависит от сложности;от 575',
  stock: 'наименование;категория;артикул;штрихкод;единица;остаток;цена продажи;закупочная цена;склад;срок годности;серия;минимальный остаток\nШприц 5 мл;Расходники;S-5;4600000000000;шт;100;12;8;Основной склад;31.12.2027;A1;20',
};
