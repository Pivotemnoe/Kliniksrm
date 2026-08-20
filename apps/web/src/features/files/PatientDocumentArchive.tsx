import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import {
  deleteAttachment,
  downloadAttachment,
  listAnimalFiles,
  previewAttachment,
  updateAnimalArchiveMetadata,
  uploadAnimalFilesBatch,
} from './files.api';
import {
  FileAttachment,
  patientArchiveCategories,
  PatientArchiveBatchResult,
  PatientArchiveCategory,
  PatientArchiveMetadata,
} from './types';

type ArchiveFormValues = {
  archiveCategory?: PatientArchiveCategory;
  documentDate?: Dayjs;
  sourceLabel?: string;
  note?: string;
};

export function PatientDocumentArchive({ animalId, canManage }: { animalId: string; canManage: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PatientArchiveCategory>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [lastResult, setLastResult] = useState<PatientArchiveBatchResult | null>(null);
  const [editingFile, setEditingFile] = useState<FileAttachment | null>(null);
  const [uploadForm] = Form.useForm<ArchiveFormValues>();
  const [editForm] = Form.useForm<ArchiveFormValues>();
  const query = {
    search: search || undefined,
    category,
    dateFrom: dateRange?.[0].format('YYYY-MM-DD'),
    dateTo: dateRange?.[1].format('YYYY-MM-DD'),
  };
  const queryKey = ['animals', animalId, 'files', 'archive', query] as const;
  const filesQuery = useQuery({ queryKey, queryFn: () => listAnimalFiles(animalId, query) });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['animals', animalId, 'files'] });
  }

  const uploadMutation = useMutation({
    mutationFn: async (values: ArchiveFormValues) => {
      const files = fileList.flatMap((item) => (item.originFileObj ? [item.originFileObj] : []));
      if (!files.length) throw new Error('Выберите хотя бы один файл');
      return uploadAnimalFilesBatch(animalId, files, toMetadata(values));
    },
    onSuccess: async (result) => {
      setLastResult(result);
      setFileList([]);
      uploadForm.resetFields();
      await refresh();
      if (result.failed.length) message.warning('Загрузка завершена с ошибками. Проверьте отчёт ниже.');
      else message.success(`Загружено документов: ${result.uploaded.length}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: downloadAttachment,
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const previewMutation = useMutation({
    mutationFn: previewAttachment,
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAttachment,
    onSuccess: async () => {
      await refresh();
      message.success('Файл удалён из активного архива; событие сохранено в аудите');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: (values: ArchiveFormValues) => updateAnimalArchiveMetadata(editingFile!.id, toMetadata(values)),
    onSuccess: async () => {
      await refresh();
      setEditingFile(null);
      message.success('Описание документа обновлено');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function openEdit(file: FileAttachment) {
    setEditingFile(file);
    editForm.setFieldsValue({
      archiveCategory: file.archiveCategory ?? undefined,
      documentDate: file.documentDate ? dayjs(file.documentDate) : undefined,
      sourceLabel: file.sourceLabel ?? undefined,
      note: file.note ?? undefined,
    });
  }

  return (
    <Space direction="vertical" size={14} className="full-width">
      <div>
        <Typography.Title level={4}>Архив документов пациента</Typography.Title>
        <Typography.Text type="secondary">История лечения, анализы, заключения, согласия, выписки и изображения. Скачивание и изменения записываются в аудит.</Typography.Text>
      </div>

      {canManage ? (
        <Card size="small" title="Пакетная загрузка до 20 файлов">
          <Form form={uploadForm} layout="vertical" onFinish={(values) => uploadMutation.mutate(values)}>
            <div className="form-grid two-columns">
              <Form.Item name="archiveCategory" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}>
                <Select options={categoryOptions} />
              </Form.Item>
              <Form.Item name="documentDate" label="Дата документа">
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sourceLabel" label="Источник">
                <Input maxLength={160} placeholder="Например, предыдущая клиника" />
              </Form.Item>
              <Form.Item name="note" label="Комментарий">
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
            </div>
            <Upload.Dragger
              multiple
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.xls,.csv"
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: next }) => setFileList(next.slice(0, 20))}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Перетащите документы сюда или нажмите для выбора</p>
              <p className="ant-upload-hint">Каждый файл — до 15 МБ. Полные дубли не загружаются повторно.</p>
            </Upload.Dragger>
            <Button type="primary" htmlType="submit" icon={<UploadOutlined />} loading={uploadMutation.isPending} disabled={!fileList.length} style={{ marginTop: 12 }}>
              Загрузить выбранные ({fileList.length})
            </Button>
          </Form>
        </Card>
      ) : null}

      {lastResult ? <BatchResultAlert result={lastResult} /> : null}

      <Card size="small" title="Документы">
        <Space wrap className="archive-filters">
          <LiveSearchInput
            allowClear
            value={searchDraft}
            placeholder="Название, источник или комментарий"
            onChange={(event) => setSearchDraft(event.target.value)}
            onSearch={(value) => setSearch(value.trim())}
            style={{ width: 340 }}
          />
          <Select allowClear placeholder="Все категории" value={category} options={categoryOptions} onChange={setCategory} style={{ width: 210 }} />
          <DatePicker.RangePicker value={dateRange} format="DD.MM.YYYY" onChange={(value) => setDateRange(value?.[0] && value[1] ? [value[0], value[1]] : null)} />
          <Button onClick={() => { setSearchDraft(''); setSearch(''); setCategory(undefined); setDateRange(null); }}>Сбросить</Button>
        </Space>
        {filesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(filesQuery.error)} style={{ marginTop: 12 }} /> : null}
        <List<FileAttachment>
          loading={filesQuery.isLoading}
          dataSource={filesQuery.data ?? []}
          locale={{ emptyText: 'Документы по выбранным условиям не найдены' }}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button key="preview" type="link" size="small" icon={<EyeOutlined />} onClick={() => previewMutation.mutate(file)}>Открыть</Button>,
                <Button key="download" type="link" size="small" icon={<DownloadOutlined />} onClick={() => downloadMutation.mutate(file)}>Скачать</Button>,
                canManage ? <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(file)}>Описание</Button> : null,
                canManage ? <Popconfirm key="delete" title="Удалить файл из активного архива?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteMutation.mutate(file.id)}><Button danger type="link" size="small" icon={<DeleteOutlined />}>Удалить</Button></Popconfirm> : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text strong>{file.originalName}</Typography.Text><Tag>{file.archiveCategory ?? 'Без категории'}</Tag></Space>}
                description={
                  <Space direction="vertical" size={1}>
                    <Typography.Text type="secondary">{[
                      file.documentDate ? `Документ от ${dayjs(file.documentDate).format('DD.MM.YYYY')}` : null,
                      file.sourceLabel ? `Источник: ${file.sourceLabel}` : null,
                      file.uploadedBy?.fullName ? `Загрузил: ${file.uploadedBy.fullName}` : null,
                      `Добавлен ${dayjs(file.createdAt).format('DD.MM.YYYY HH:mm')}`,
                      formatFileSize(file.sizeBytes),
                    ].filter(Boolean).join(' · ')}</Typography.Text>
                    {file.note ? <Typography.Text>{file.note}</Typography.Text> : null}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        open={Boolean(editingFile)}
        title={`Описание документа: ${editingFile?.originalName ?? ''}`}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={updateMutation.isPending}
        onCancel={() => setEditingFile(null)}
        onOk={() => editForm.submit()}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => updateMutation.mutate(values)}>
          <Form.Item name="archiveCategory" label="Категория"><Select allowClear options={categoryOptions} /></Form.Item>
          <Form.Item name="documentDate" label="Дата документа"><DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="sourceLabel" label="Источник"><Input maxLength={160} /></Form.Item>
          <Form.Item name="note" label="Комментарий"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function BatchResultAlert({ result }: { result: PatientArchiveBatchResult }) {
  const type = result.failed.length ? 'warning' : 'success';
  return (
    <Alert
      type={type}
      showIcon
      message={`Загружено: ${result.uploaded.length}. Дубли: ${result.duplicates.length}. Ошибки: ${result.failed.length}.`}
      description={
        <Space direction="vertical" size={2}>
          {result.duplicates.map((item) => <Typography.Text key={`duplicate-${item.originalName}`} type="secondary">Дубль: {item.originalName}</Typography.Text>)}
          {result.failed.map((item) => <Typography.Text key={`failed-${item.originalName}`} type="danger">{item.originalName}: {item.message}</Typography.Text>)}
        </Space>
      }
    />
  );
}

function toMetadata(values: ArchiveFormValues): PatientArchiveMetadata {
  return {
    archiveCategory: values.archiveCategory,
    documentDate: values.documentDate?.format('YYYY-MM-DD'),
    sourceLabel: values.sourceLabel?.trim() || undefined,
    note: values.note?.trim() || undefined,
  };
}

function formatFileSize(value: number | null) {
  if (value === null) return 'размер не указан';
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

const categoryOptions = patientArchiveCategories.map((value) => ({ value, label: value }));
