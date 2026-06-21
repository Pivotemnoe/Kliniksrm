import { EditOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { createDocumentTemplate, listDocumentTemplates, updateDocumentTemplate } from './documents.api';
import { DocumentVariablePalette } from './DocumentVariablePalette';
import { DocumentTemplate } from './types';

const templateSchema = z.object({
  title: z.string().trim().min(2, 'Укажите название').max(200),
  categoryTitle: z.string().trim().max(120).optional(),
  body: z.string().trim().max(20000).optional(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export function DocumentTemplatesPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'documents.manage');
  const templatesQuery = useQuery({ queryKey: ['document-templates'], queryFn: listDocumentTemplates });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const { control, getValues, handleSubmit, reset, setValue, watch } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { title: '', categoryTitle: '', body: '' },
  });
  const previewTitle = watch('title');
  const previewBody = watch('body');
  const saveMutation = useMutation({
    mutationFn: (values: TemplateFormValues) =>
      editingTemplate ? updateDocumentTemplate(editingTemplate.id, values) : createDocumentTemplate(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      message.success(editingTemplate ? 'Шаблон обновлён' : 'Шаблон создан');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<DocumentTemplate>>(
    () => [
      {
        title: 'Шаблон',
        dataIndex: 'title',
        key: 'title',
        render: (value: string, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            <Typography.Text type="secondary">{record.body ? `${record.body.slice(0, 120)}${record.body.length > 120 ? '...' : ''}` : 'Без текста'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Категория',
        key: 'category',
        width: 180,
        render: (_, record) => (record.category?.title ? <Tag>{record.category.title}</Tag> : '—'),
      },
      {
        title: 'Обновлён',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 180,
        render: (value: string) => new Date(value).toLocaleString('ru-RU'),
      },
      {
        title: '',
        key: 'actions',
        width: 230,
        render: (_, record) =>
          (
            <Space wrap>
              <Button size="small" icon={<PrinterOutlined />} onClick={() => printTemplate(record.title, record.body ?? '', record.category?.title)}>
                Печать
              </Button>
              {canManage ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  Открыть
                </Button>
              ) : null}
            </Space>
          ),
      },
    ],
    [canManage],
  );

  function openCreate() {
    setEditingTemplate(null);
    reset({ title: '', categoryTitle: '', body: '' });
    setModalOpen(true);
  }

  function openEdit(template: DocumentTemplate) {
    setEditingTemplate(template);
    reset({ title: template.title, categoryTitle: template.category?.title ?? '', body: template.body ?? '' });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTemplate(null);
    reset({ title: '', categoryTitle: '', body: '' });
  }

  function insertVariable(variable: string) {
    const body = getValues('body') ?? '';
    const separator = body && !body.endsWith(' ') && !body.endsWith('\n') ? ' ' : '';
    setValue('body', `${body}${separator}{${variable}}`, { shouldDirty: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Шаблоны документов"
        description="Текстовые шаблоны для приёмов, согласий и рекомендаций."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Создать шаблон
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-body">
          {templatesQuery.isError ? <Typography.Text type="danger">{getErrorMessage(templatesQuery.error)}</Typography.Text> : null}
          <Table<DocumentTemplate>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            pagination={false}
            onRow={(record) => ({ onDoubleClick: () => openEdit(record) })}
          />
        </div>
      </div>
      <Modal
        title={editingTemplate ? 'Редактирование шаблона' : 'Новый шаблон'}
        open={modalOpen}
        onCancel={closeModal}
        width={760}
        destroyOnHidden
        footer={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => printTemplate(previewTitle || 'Без названия', previewBody ?? '', getValues('categoryTitle'))}>
              Печать образца
            </Button>
            <Button onClick={closeModal}>Отмена</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))}>
              Сохранить
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <div className="form-grid two-columns">
            <Controller
              control={control}
              name="title"
              render={({ field, fieldState }) => (
                <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} autoFocus />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="categoryTitle"
              render={({ field, fieldState }) => (
                <Form.Item label="Категория" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} placeholder="Например, Приём или Согласия" />
                </Form.Item>
              )}
            />
          </div>
          <Controller
            control={control}
            name="body"
            render={({ field, fieldState }) => (
              <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input.TextArea {...field} rows={16} />
              </Form.Item>
            )}
          />
          <div className="document-editor-grid">
            <Card size="small" title="Переменные">
              <DocumentVariablePalette onInsert={insertVariable} />
            </Card>
            <Card size="small" title="Предпросмотр шаблона">
              <div className="document-preview">
                <h3>{previewTitle || 'Без названия'}</h3>
                <div>{previewBody || 'Текст шаблона пока пустой'}</div>
              </div>
            </Card>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

function printTemplate(title: string, body: string, category?: string | null) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    return;
  }

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #ffffff; font: 15px/1.5 Arial, sans-serif; }
    .page { max-width: 820px; margin: 0 auto; padding: 30px 34px 42px; }
    .header { display: grid; grid-template-columns: 72px 1fr; gap: 16px; align-items: center; padding-bottom: 18px; border-bottom: 2px solid #111827; }
    .logo { width: 68px; height: 68px; object-fit: contain; }
    .brand { font-size: 22px; font-weight: 700; }
    .muted { color: #6b7280; }
    h1 { margin: 26px 0 12px; font-size: 24px; line-height: 1.2; }
    .category { display: inline-block; margin-bottom: 20px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 999px; color: #374151; font-size: 12px; }
    .body { min-height: 360px; white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 46px; }
    .signature { padding-top: 28px; border-top: 1px solid #111827; color: #374151; font-size: 13px; }
    @media print { .page { padding: 20mm 16mm; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <img class="logo" src="/brand/temichevvet-logo.jpg" alt="TemichevVet" />
      <div>
        <div class="brand">TemichevVet</div>
        <div class="muted">Образец шаблона документа</div>
      </div>
    </section>
    <h1>${escapeHtml(title)}</h1>
    ${category ? `<div class="category">${escapeHtml(category)}</div>` : ''}
    <section class="body">${escapeHtml(body || 'Текст шаблона пока пустой')}</section>
    <section class="signatures">
      <div class="signature">Подпись владельца</div>
      <div class="signature">Подпись врача</div>
    </section>
  </main>
  <script>window.print();</script>
</body>
</html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
