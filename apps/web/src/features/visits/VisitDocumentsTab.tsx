import { EditOutlined, PlusOutlined, PrinterOutlined, SendOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import {
  createVisitDocument,
  listDocumentTemplates,
  listVisitDocuments,
  updateVisitDocument,
} from '../documents/documents.api';
import { DocumentVariablePalette } from '../documents/DocumentVariablePalette';
import {
  DocumentStatus,
  VisitDocument,
  documentStatusColors,
  documentStatusLabels,
} from '../documents/types';
import { createNotification } from '../notifications/notifications.api';
import { CreateNotificationInput, NotificationChannel, notificationChannelLabels } from '../notifications/types';
import { Visit } from './types';

const documentStatuses = ['DRAFT', 'GENERATED', 'SIGNED', 'CANCELLED'] as const satisfies readonly DocumentStatus[];

const documentSchema = z
  .object({
    templateId: z.string().optional(),
    title: z.string().trim().optional(),
    body: z.string().trim().optional(),
    status: z.enum(documentStatuses),
  })
  .refine((value) => Boolean(value.templateId || value.title?.trim()), {
    path: ['title'],
    message: 'Укажите название документа или выберите шаблон',
  });

type DocumentFormValues = z.infer<typeof documentSchema>;

export function VisitDocumentsTab({ visit, locked }: { visit: Visit; locked: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'documents.manage') && !locked;
  const canPrint = hasPermission(auth?.employee, 'documents.print');
  const canSend = hasPermission(auth?.employee, 'notifications.manage');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<VisitDocument | null>(null);
  const notificationTarget = useMemo(() => resolveOwnerNotificationTarget(visit), [visit]);
  const templatesQuery = useQuery({ queryKey: ['document-templates'], queryFn: listDocumentTemplates });
  const documentsQuery = useQuery({
    queryKey: ['visits', visit.id, 'documents'],
    queryFn: () => listVisitDocuments(visit.id),
  });
  const { control, getValues, handleSubmit, reset, setValue, watch } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      templateId: undefined,
      title: '',
      body: '',
      status: 'DRAFT',
    },
  });
  const previewTitle = watch('title');
  const previewBody = watch('body');
  const saveMutation = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      editingDocument
        ? updateVisitDocument(visit.id, editingDocument.id, values)
        : createVisitDocument(visit.id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] }),
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      message.success(editingDocument ? 'Документ обновлён' : 'Документ создан');
      closeDrawer();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const sendMutation = useMutation({
    mutationFn: (document: VisitDocument) => {
      if (!notificationTarget) {
        throw new Error('У владельца не задан разрешённый канал связи');
      }

      return createNotification(buildDocumentNotification(visit, document, notificationTarget));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      message.success('Документ поставлен в очередь отправки');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const templateOptions = useMemo(
    () =>
      (templatesQuery.data ?? []).map((template) => ({
        value: template.id,
        label: `${template.category?.title ? `${template.category.title} · ` : ''}${template.title}`,
      })),
    [templatesQuery.data],
  );
  const columns = useMemo<ColumnsType<VisitDocument>>(
    () => [
      {
        title: 'Документ',
        dataIndex: 'title',
        key: 'title',
        render: (value: string, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            <Typography.Text type="secondary">{record.template?.category?.title ?? record.template?.title ?? 'Без шаблона'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 150,
        render: (value: DocumentStatus) => <Tag color={documentStatusColors[value]}>{documentStatusLabels[value]}</Tag>,
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
        width: 330,
        render: (_, record) =>
          (
            <Space wrap>
              {canPrint ? (
                <Button size="small" icon={<PrinterOutlined />} onClick={() => printDocument(record, visit)}>
                  Печать
                </Button>
              ) : null}
              {canSend ? (
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={sendMutation.isPending}
                  disabled={!canQueueDocument(record) || !notificationTarget}
                  onClick={() => sendMutation.mutate(record)}
                >
                  Отправить
                </Button>
              ) : null}
              {canManage ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  Открыть
                </Button>
              ) : null}
            </Space>
          ),
      },
    ],
    [canManage, canPrint, canSend, notificationTarget, sendMutation],
  );

  function openCreate() {
    setEditingDocument(null);
    reset({ templateId: undefined, title: '', body: '', status: 'DRAFT' });
    setDrawerOpen(true);
  }

  function openEdit(document: VisitDocument) {
    setEditingDocument(document);
    reset({
      templateId: document.templateId ?? undefined,
      title: document.title,
      body: document.body ?? '',
      status: document.status,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingDocument(null);
    reset({ templateId: undefined, title: '', body: '', status: 'DRAFT' });
  }

  function insertVariable(variable: string) {
    const body = getValues('body') ?? '';
    const separator = body && !body.endsWith(' ') && !body.endsWith('\n') ? ' ' : '';
    setValue('body', `${body}${separator}{${variable}}`, { shouldDirty: true });
  }

  return (
    <div className="visit-tab-panel">
      <div className="tab-toolbar">
        <div>
          <Typography.Title level={4}>Документы приёма</Typography.Title>
          <Typography.Text type="secondary">Согласия, листы осмотра и рекомендации по шаблонам клиники.</Typography.Text>
        </div>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Создать документ
          </Button>
        ) : null}
      </div>
      {documentsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(documentsQuery.error)}</Typography.Text> : null}
      {canSend && !notificationTarget ? (
        <Typography.Text type="secondary">
          Чтобы отправлять документы клиенту, у владельца должен быть разрешён Telegram, MAX или email.
        </Typography.Text>
      ) : null}
      <Table<VisitDocument>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={documentsQuery.data ?? []}
        loading={documentsQuery.isLoading}
        pagination={false}
        locale={{ emptyText: 'Документы приёма пока не созданы' }}
        onRow={(record) => ({ onDoubleClick: () => openEdit(record) })}
      />
      <Drawer
        title={editingDocument ? 'Документ приёма' : 'Новый документ приёма'}
        width={760}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        extra={
          <Space>
            {editingDocument && canPrint ? (
              <Button icon={<PrinterOutlined />} onClick={() => printDocument(editingDocument, visit)}>
                Печать
              </Button>
            ) : null}
            {editingDocument && canSend ? (
              <Button
                icon={<SendOutlined />}
                loading={sendMutation.isPending}
                disabled={!canQueueDocument(editingDocument) || !notificationTarget}
                onClick={() => sendMutation.mutate(editingDocument)}
              >
                Отправить
              </Button>
            ) : null}
            {canManage ? (
              <Button type="primary" loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))}>
                Сохранить
              </Button>
            ) : null}
          </Space>
        }
      >
        <Form layout="vertical">
          <Controller
            control={control}
            name="templateId"
            render={({ field }) => (
              <Form.Item label="Шаблон">
                <Select
                  {...field}
                  allowClear
                  showSearch
                  loading={templatesQuery.isLoading}
                  options={templateOptions}
                  placeholder="Выберите шаблон"
                  onChange={(value) => {
                    field.onChange(value);
                    const template = (templatesQuery.data ?? []).find((item) => item.id === value);
                    if (template && !editingDocument) {
                      setValue('title', template.title, { shouldDirty: true, shouldValidate: true });
                      setValue('body', template.body ?? '', { shouldDirty: true });
                    }
                  }}
                />
              </Form.Item>
            )}
          />
          <div className="form-grid two-columns">
            <Controller
              control={control}
              name="title"
              render={({ field, fieldState }) => (
                <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} placeholder="Например, лист первичного приёма" />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Form.Item label="Статус">
                  <Select
                    {...field}
                    options={documentStatuses.map((status) => ({ value: status, label: documentStatusLabels[status] }))}
                  />
                </Form.Item>
              )}
            />
          </div>
          <Controller
            control={control}
            name="body"
            render={({ field }) => (
              <Form.Item label="Текст документа">
                <Input.TextArea {...field} rows={16} placeholder="Текст документа" />
              </Form.Item>
            )}
          />
          <div className="document-editor-grid">
            <Card size="small" title={editingDocument ? 'Печатный вид' : 'Переменные шаблона'}>
              {editingDocument ? (
                <Typography.Text type="secondary">
                  Документ уже сформирован. Новые переменные в существующем тексте не подставляются автоматически.
                </Typography.Text>
              ) : (
                <DocumentVariablePalette onInsert={insertVariable} />
              )}
            </Card>
            <Card size="small" title="Предпросмотр">
              <div className="document-preview">
                <h3>{previewTitle || 'Без названия'}</h3>
                <div>{previewBody || 'Текст документа пока пустой'}</div>
              </div>
            </Card>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}

function printDocument(document: VisitDocument, visit: Visit) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    return;
  }
  const visitDate = new Date(visit.startedAt).toLocaleString('ru-RU');
  const ownerPhone = [visit.owner.phone, visit.owner.extraPhone].filter(Boolean).join(', ');
  const animalLine = [
    visit.animal.nickname,
    visit.animal.species,
    visit.animal.breed,
    visit.animal.sex === 'MALE' ? 'самец' : visit.animal.sex === 'FEMALE' ? 'самка' : null,
  ].filter(Boolean).join(', ');

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #ffffff; font: 15px/1.5 Arial, sans-serif; }
    .page { max-width: 820px; margin: 0 auto; padding: 30px 34px 42px; }
    .header { display: grid; grid-template-columns: 72px 1fr; gap: 16px; align-items: center; padding-bottom: 18px; border-bottom: 2px solid #111827; }
    .logo { width: 68px; height: 68px; object-fit: contain; }
    .brand { font-size: 22px; font-weight: 700; }
    .muted { color: #6b7280; }
    h1 { margin: 26px 0 14px; font-size: 24px; line-height: 1.2; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin: 0 0 24px; padding: 14px; border: 1px solid #d1d5db; border-radius: 8px; }
    .meta-row span { display: block; color: #6b7280; font-size: 12px; }
    .meta-row strong { display: block; font-weight: 600; }
    .status { display: inline-block; margin-bottom: 18px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 999px; color: #374151; font-size: 12px; }
    .body { min-height: 300px; white-space: pre-wrap; }
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
        <div class="muted">Документ ветеринарной клиники</div>
      </div>
    </section>
    <h1>${escapeHtml(document.title)}</h1>
    <div class="status">Документ приёма · ${documentStatusLabels[document.status]}</div>
    <section class="meta-grid">
      <div class="meta-row"><span>Дата приёма</span><strong>${escapeHtml(visitDate)}</strong></div>
      <div class="meta-row"><span>Врач</span><strong>${escapeHtml(visit.employee?.fullName ?? '—')}</strong></div>
      <div class="meta-row"><span>Владелец</span><strong>${escapeHtml(visit.owner.fullName)}</strong></div>
      <div class="meta-row"><span>Телефон</span><strong>${escapeHtml(ownerPhone || '—')}</strong></div>
      <div class="meta-row"><span>Пациент</span><strong>${escapeHtml(animalLine || '—')}</strong></div>
    </section>
    <section class="body">${escapeHtml(document.body ?? '')}</section>
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

type NotificationTarget = {
  channel: NotificationChannel;
  recipient: string;
};

function canQueueDocument(document: VisitDocument) {
  return document.status === 'GENERATED' || document.status === 'SIGNED';
}

function resolveOwnerNotificationTarget(visit: Visit): NotificationTarget | null {
  const owner = visit.owner;
  const candidates: NotificationTarget[] = [
    owner.preferredNotificationChannel === 'TELEGRAM' && owner.allowTelegram && owner.telegramChatId
      ? { channel: 'TELEGRAM', recipient: owner.telegramChatId }
      : null,
    owner.preferredNotificationChannel === 'MAX' && owner.allowMax && owner.maxUserId
      ? { channel: 'MAX', recipient: owner.maxUserId }
      : null,
    owner.preferredNotificationChannel === 'EMAIL' && owner.allowEmail && owner.email
      ? { channel: 'EMAIL', recipient: owner.email }
      : null,
    owner.allowTelegram && owner.telegramChatId ? { channel: 'TELEGRAM', recipient: owner.telegramChatId } : null,
    owner.allowMax && owner.maxUserId ? { channel: 'MAX', recipient: owner.maxUserId } : null,
    owner.allowEmail && owner.email ? { channel: 'EMAIL', recipient: owner.email } : null,
  ].filter(Boolean) as NotificationTarget[];

  return candidates[0] ?? null;
}

function buildDocumentNotification(visit: Visit, document: VisitDocument, target: NotificationTarget): CreateNotificationInput {
  const visitDate = new Date(visit.startedAt).toLocaleString('ru-RU');
  const channelLabel = notificationChannelLabels[target.channel];

  return {
    channel: target.channel,
    recipient: target.recipient,
    ownerId: visit.ownerId,
    animalId: visit.animalId,
    subject: `Документ TemichevVet: ${document.title}`,
    body: [
      `${visit.owner.fullName}, документ "${document.title}" по пациенту ${visit.animal.nickname} поставлен в отправку через ${channelLabel}.`,
      `Дата приёма: ${visitDate}.`,
      'Документ также доступен в личном кабинете владельца.',
      '',
      document.body ?? '',
    ].join('\n'),
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
