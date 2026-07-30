import { CheckCircleOutlined, FileExcelOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { uploadLaboratoryOrderFile } from '../files/files.api';
import { parseImportFile } from '../imports/import-file-parser';
import { importLaboratoryResults } from './laboratory.api';
import { LaboratoryOrder, LaboratoryResultImportRow, LaboratoryResultsImportPreview } from './types';

export function LaboratoryResultsImporter({ order }: { order: LaboratoryOrder }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LaboratoryResultImportRow[]>([]);
  const [preview, setPreview] = useState<LaboratoryResultsImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const applyMutation = useMutation({
    mutationFn: () => importLaboratoryResults(order.id, 'APPLY', rows),
    onSuccess: async (result) => {
      let sourceSaved = false;
      if (sourceFile) {
        try {
          await uploadLaboratoryOrderFile(order.id, sourceFile);
          sourceSaved = true;
        } catch (error) {
          message.warning(`Результаты внесены, но исходный файл не сохранился: ${getErrorMessage(error)}`);
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'order-files', order.id] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      if (sourceSaved) message.success(`Загружено результатов: ${result.applied ?? result.summary.matched}. Исходный файл сохранён.`);
      close();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function selectFile(file: File) {
    setParsing(true);
    setParseError(null);
    setPreview(null);
    try {
      const parsed = await parseImportFile(file);
      const prepared = mapLaboratoryRows(parsed.columns, parsed.rows);
      if (prepared.length > 200) throw new Error('В одном файле можно загрузить не более 200 результатов');
      const checked = await importLaboratoryResults(order.id, 'PREVIEW', prepared);
      setSourceFile(file);
      setRows(prepared);
      setPreview(checked);
    } catch (error) {
      setSourceFile(null);
      setRows([]);
      setParseError(getErrorMessage(error));
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function close() {
    setOpen(false);
    setSourceFile(null);
    setRows([]);
    setPreview(null);
    setParseError(null);
  }

  return (
    <>
      <Button icon={<UploadOutlined />} onClick={() => setOpen(true)}>Загрузить результаты</Button>
      <Modal
        title="Загрузка результатов из таблицы"
        open={open}
        onCancel={close}
        width={900}
        okText="Внести распознанные результаты"
        cancelText="Закрыть"
        okButtonProps={{ disabled: !preview?.canApply }}
        confirmLoading={applyMutation.isPending}
        onOk={() => applyMutation.mutate()}
        destroyOnHidden
      >
        <Space direction="vertical" size={14} className="full-width">
          <Alert
            type="info"
            showIcon
            message="Сначала выполняется безопасная проверка"
            description="CRM сама найдёт колонки «Код/Анализ», «Результат», «Единица» и «Референс», затем сопоставит строки только с анализами этого заказа. Пока все строки не распознаны однозначно, внесение заблокировано."
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx,.csv,.tsv,.txt,.docx"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void selectFile(file);
            }}
          />
          <Button icon={<FileExcelOutlined />} loading={parsing} onClick={() => fileInputRef.current?.click()}>
            {sourceFile ? 'Выбрать другой файл' : 'Выбрать XLS, XLSX, CSV или DOCX'}
          </Button>
          {sourceFile ? <Typography.Text>Файл: {sourceFile.name}</Typography.Text> : null}
          {parseError ? <Alert type="error" showIcon message={parseError} /> : null}
          {preview ? (
            <>
              <Alert
                type={preview.canApply ? 'success' : 'warning'}
                showIcon
                icon={preview.canApply ? <CheckCircleOutlined /> : <WarningOutlined />}
                message={preview.canApply ? `Все ${preview.summary.matched} строк распознаны` : `Нужно исправить строк: ${preview.summary.issues}`}
                description={preview.canApply ? 'Можно безопасно внести результаты. Исходный файл также сохранится в лабораторном заказе.' : 'CRM ничего не внесла. Исправьте название или код анализа в исходном файле и повторите проверку.'}
              />
              <Table
                rowKey="rowNumber"
                size="small"
                pagination={false}
                scroll={{ y: 360 }}
                dataSource={preview.rows}
                columns={[
                  { title: 'Строка', dataIndex: 'rowNumber', width: 75 },
                  { title: 'Из файла', key: 'source', render: (_, row) => row.title || row.code || '—' },
                  { title: 'Результат', dataIndex: 'resultValue', render: (value) => value || '—' },
                  { title: 'Анализ в заказе', dataIndex: 'itemTitle', render: (value) => value || '—' },
                  {
                    title: 'Проверка',
                    key: 'status',
                    render: (_, row) => <Tag color={row.matchStatus === 'MATCHED' ? 'green' : 'red'}>{row.message}</Tag>,
                  },
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
  code: ['код', 'коданализа', 'code', 'testcode'],
  title: ['анализ', 'названиеанализа', 'наименование', 'показатель', 'исследование', 'test'],
  resultValue: ['результат', 'значение', 'результатанализа', 'value', 'result'],
  resultText: ['текстрезультата', 'интерпретация', 'заключение', 'resulttext'],
  unit: ['единица', 'единицаизмерения', 'едизм', 'ед', 'unit'],
  referenceRange: ['референс', 'референсныезначения', 'норма', 'нормы', 'reference', 'range'],
  comment: ['комментарий', 'примечание', 'comment', 'note'],
} satisfies Record<Exclude<keyof LaboratoryResultImportRow, 'rowNumber'>, string[]>;

function mapLaboratoryRows(columns: string[], rows: Array<{ rowNumber: number; data: Record<string, string> }>) {
  const mapping = Object.fromEntries(Object.entries(aliases).map(([field, values]) => [field, findColumn(columns, values)])) as Record<keyof typeof aliases, string | undefined>;
  if (!mapping.code && !mapping.title) throw new Error('Не найдена колонка с кодом или названием анализа');
  if (!mapping.resultValue && !mapping.resultText) throw new Error('Не найдена колонка «Результат» или «Значение»');
  const prepared = rows.map((row) => {
    const value = (field: keyof typeof aliases) => mapping[field] ? row.data[mapping[field]!]?.trim() || undefined : undefined;
    return {
      rowNumber: row.rowNumber,
      code: value('code'),
      title: value('title'),
      resultValue: value('resultValue'),
      resultText: value('resultText'),
      unit: value('unit'),
      referenceRange: value('referenceRange'),
      comment: value('comment'),
    };
  }).filter((row) => Boolean((row.code || row.title) && (row.resultValue || row.resultText)));
  if (!prepared.length) throw new Error('В файле нет строк, где одновременно указаны анализ и результат');
  return prepared;
}

function findColumn(columns: string[], values: string[]) {
  const exact = columns.find((column) => values.includes(normalizeHeader(column)));
  if (exact) return exact;
  return columns.find((column) => values.some((alias) => alias.length >= 4 && normalizeHeader(column).includes(alias)));
}

function normalizeHeader(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/g, '');
}
