import { DeleteOutlined, EditOutlined, PlusOutlined, PrinterOutlined, SendOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listVisitFiles, uploadVisitFile } from '../files/files.api';
import {
  createVisitDocument,
  deleteVisitDocument,
  downloadVisitDocumentPdf,
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
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canAttach = hasPermission(auth?.employee, 'documents.manage');
  const canManage = canAttach && !locked;
  const canPrint = hasPermission(auth?.employee, 'documents.print');
  const canSend = hasPermission(auth?.employee, 'notifications.manage');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<VisitDocument | null>(null);
  const [printingDocumentId, setPrintingDocumentId] = useState<string | null>(null);
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
  const documentFrozen = Boolean(
    editingDocument && (editingDocument.status !== 'DRAFT' || editingDocument.generatedDocument),
  );
  const saveMutation = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      editingDocument
        ? updateVisitDocument(
            visit.id,
            editingDocument.id,
            documentFrozen ? { status: values.status } : values,
          )
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] }),
      ]);
      message.success('Документ поставлен в очередь отправки');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteVisitDocument(visit.id, documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] });
      message.success('Документ удалён');
      closeDrawer();
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
            <Typography.Text type="secondary">
              {record.template?.category?.title ?? record.template?.title ?? 'Без шаблона'}
              {record.templateVersion ? ` · версия ${record.templateVersion.version}` : ''}
            </Typography.Text>
            {record.deliveries.length ? (
              <Typography.Text type="secondary">Отправок: {record.deliveries.length}</Typography.Text>
            ) : null}
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
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  loading={printingDocumentId === record.id}
                  onClick={() => handlePrint(record)}
                >
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
              {canManage && canDeleteVisitDocument(record) ? (
                <Button danger size="small" icon={<DeleteOutlined />} loading={deleteMutation.isPending} onClick={() => confirmDelete(record)}>
                  Удалить
                </Button>
              ) : null}
            </Space>
          ),
      },
    ],
    [canManage, canPrint, canSend, deleteMutation.isPending, notificationTarget, sendMutation],
  );

  function confirmDelete(document: VisitDocument) {
    modal.confirm({
      title: 'Удалить документ?',
      content: `Черновик «${document.title}» будет удалён без возможности восстановления. Данные приёма не изменятся.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(document.id),
    });
  }

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

  async function handlePrint(document: VisitDocument) {
    if (!document.generatedDocument) {
      printDocument(document, visit);
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      message.error('Браузер заблокировал окно печати');
      return;
    }
    setPrintingDocumentId(document.id);
    try {
      const result = await downloadVisitDocumentPdf(visit.id, document.id);
      const url = URL.createObjectURL(result.blob);
      printWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] });
    } catch (error) {
      printWindow.close();
      message.error(getErrorMessage(error));
    } finally {
      setPrintingDocumentId(null);
    }
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
      <Card size="small" title="Загруженные документы и снимки" style={{ marginTop: 16 }}>
        <AttachmentsPanel
          queryKey={['visits', visit.id, 'files']}
          listFiles={() => listVisitFiles(visit.id)}
          uploadFile={(file) => uploadVisitFile(visit.id, file)}
          canManage={canAttach}
          description="Заключения, согласия, выписки, результаты сторонней лаборатории и снимки. Файл сохраняется в истории приёма; завершение приёма не удаляет его."
        />
      </Card>
      <Drawer
        title={editingDocument ? 'Документ приёма' : 'Новый документ приёма'}
        width={760}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        extra={
          <Space>
            {editingDocument && canPrint ? (
              <Button
                icon={<PrinterOutlined />}
                loading={printingDocumentId === editingDocument.id}
                onClick={() => handlePrint(editingDocument)}
              >
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
            {editingDocument && canManage && canDeleteVisitDocument(editingDocument) ? (
              <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} onClick={() => confirmDelete(editingDocument)}>
                Удалить
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
          {documentFrozen ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Сформированная версия защищена от изменений"
              description={
                editingDocument?.generatedDocument?.contentSha256
                  ? `Версия шаблона: ${editingDocument.templateVersion?.version ?? 'без шаблона'} · контрольная сумма ${editingDocument.generatedDocument.contentSha256.slice(0, 12)}…`
                  : 'Текст и шаблон больше не меняются. Можно только подписать или отменить документ.'
              }
            />
          ) : null}
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
                  disabled={documentFrozen}
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
                  <Input {...field} disabled={documentFrozen} placeholder="Например, лист первичного приёма" />
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
                    options={getAvailableDocumentStatuses(editingDocument).map((status) => ({
                      value: status,
                      label: documentStatusLabels[status],
                    }))}
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
                <Input.TextArea {...field} disabled={documentFrozen} rows={16} placeholder="Текст документа" />
              </Form.Item>
            )}
          />
          <div className="document-editor-grid">
            <Card size="small" title={editingDocument ? 'Печатный вид' : 'Переменные шаблона'}>
              {editingDocument ? (
                <Typography.Text type="secondary">
                  {documentFrozen
                    ? 'Это зафиксированный экземпляр документа. Изменения шаблона на него не повлияют.'
                    : 'Переменные уже подставлены. До формирования текст можно проверить и исправить.'}
                </Typography.Text>
              ) : (
                <DocumentVariablePalette onInsert={insertVariable} />
              )}
            </Card>
            <Card size="small" title={editingDocument ? 'Печатный вид' : 'Предпросмотр с данными приёма'}>
              <div className="document-preview">
                <h3>{previewTitle || 'Без названия'}</h3>
                <div>{renderVisitDocumentPreview(previewBody ?? '', visit) || 'Текст документа пока пустой'}</div>
              </div>
            </Card>
          </div>
          {editingDocument ? (
            <Card size="small" title="История документа" style={{ marginTop: 16 }}>
              <Timeline
                items={[
                  ...editingDocument.events.map((event) => ({
                    color: getDocumentEventColor(event.type),
                    children: (
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{getDocumentEventLabel(event.type, event.channel)}</Typography.Text>
                        <Typography.Text type="secondary">
                          {new Date(event.createdAt).toLocaleString('ru-RU')}
                          {event.actorName ? ` · ${event.actorName}` : ''}
                        </Typography.Text>
                      </Space>
                    ),
                  })),
                  ...editingDocument.deliveries.map((delivery) => ({
                    color: delivery.status === 'SENT' ? 'green' : delivery.status === 'FAILED' ? 'red' : 'blue',
                    children: (
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>
                          Доставка {delivery.channel} · {formatDeliveryStatus(delivery.status)}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {new Date(delivery.createdAt).toLocaleString('ru-RU')}
                          {delivery.sentAt ? ` · отправлено ${new Date(delivery.sentAt).toLocaleString('ru-RU')}` : ''}
                        </Typography.Text>
                        {delivery.lastError ? <Typography.Text type="danger">{delivery.lastError}</Typography.Text> : null}
                      </Space>
                    ),
                  })),
                ]}
              />
            </Card>
          ) : null}
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

  const content = getFrozenDocumentContent(document);

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(content.title)}</title>
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
    <h1>${escapeHtml(content.title)}</h1>
    <div class="status">Документ приёма · ${documentStatusLabels[document.status]}</div>
    <section class="meta-grid">
      <div class="meta-row"><span>Дата приёма</span><strong>${escapeHtml(visitDate)}</strong></div>
      <div class="meta-row"><span>Врач</span><strong>${escapeHtml(visit.employee?.fullName ?? '—')}</strong></div>
      <div class="meta-row"><span>Владелец</span><strong>${escapeHtml(visit.owner.fullName)}</strong></div>
      <div class="meta-row"><span>Телефон</span><strong>${escapeHtml(ownerPhone || '—')}</strong></div>
      <div class="meta-row"><span>Пациент</span><strong>${escapeHtml(animalLine || '—')}</strong></div>
    </section>
    <section class="body">${escapeHtml(content.body)}</section>
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

export function renderVisitDocumentPreview(text: string, visit: Visit) {
  const values: Record<string, string> = {
    'organization.displayName': 'TemichevVet',
    'organization.legalName': 'Ветеринарная клиника TemichevVet',
    'organization.requisites': 'Реквизиты клиники будут подставлены при сохранении',
    'clinic.name': 'TemichevVet',
    'clinic.address': 'Адрес клиники будет подставлен при сохранении',
    'office.phone': 'Телефон клиники будет подставлен при сохранении',
    'owner.fullName': visit.owner.fullName,
    'owner.phone': visit.owner.phone ?? '',
    'owner.extraPhone': visit.owner.extraPhone ?? '',
    'owner.email': visit.owner.email ?? '',
    'owner.address': visit.owner.address ?? '',
    'animal.nickname': visit.animal.nickname,
    'animal.species': visit.animal.species ?? '',
    'animal.breed': visit.animal.breed ?? '',
    'animal.sex': visit.animal.sex === 'MALE' ? 'Самец' : visit.animal.sex === 'FEMALE' ? 'Самка' : '',
    'animal.birthDate': visit.animal.birthDate ? new Date(visit.animal.birthDate).toLocaleDateString('ru-RU') : '',
    'animal.microchip': visit.animal.microchip ?? '',
    'animal.status': visit.animal.status ?? '',
    'visit.id': visit.id,
    'visit.status': visit.status,
    'visit.startedAt': new Date(visit.startedAt).toLocaleString('ru-RU'),
    'visit.completedAt': visit.completedAt ? new Date(visit.completedAt).toLocaleString('ru-RU') : '',
    'visit.totalAmount': `${Number(visit.totalAmount).toLocaleString('ru-RU')} ₽`,
    'employee.fullName': visit.employee?.fullName ?? '',
    'employee.position': visit.employee?.position ?? '',
    'currentDate': new Date().toLocaleDateString('ru-RU'),
    'currentDateTime': new Date().toLocaleString('ru-RU'),
  };

  return text.replace(/\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g, (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) => {
    const key = singleBraceKey ?? doubleBraceKey;
    return key ? (values[key] ?? '') : '';
  });
}

type NotificationTarget = {
  channel: NotificationChannel;
  recipient: string;
};

function canQueueDocument(document: VisitDocument) {
  return document.status === 'GENERATED' || document.status === 'SIGNED';
}

function canDeleteVisitDocument(document: VisitDocument) {
  return !document.generatedDocument && (document.status === 'DRAFT' || document.status === 'CANCELLED');
}

function getAvailableDocumentStatuses(document: VisitDocument | null) {
  if (!document) return [...documentStatuses];
  const transitions: Record<DocumentStatus, readonly DocumentStatus[]> = {
    DRAFT: ['DRAFT', 'GENERATED', 'SIGNED', 'CANCELLED'],
    GENERATED: ['GENERATED', 'SIGNED', 'CANCELLED'],
    SIGNED: ['SIGNED', 'CANCELLED'],
    CANCELLED: ['CANCELLED'],
  };
  return transitions[document.status];
}

function getFrozenDocumentContent(document: VisitDocument) {
  const snapshot = document.generatedDocument?.snapshot;
  return {
    title: snapshot?.title ?? document.title,
    body: snapshot?.body ?? document.body ?? '',
  };
}

function getDocumentEventLabel(type: VisitDocument['events'][number]['type'], channel: string | null) {
  if (type === 'DELIVERY_QUEUED' && channel === 'CLIENT_PORTAL') {
    return 'Подготовлен для личного кабинета владельца';
  }
  const labels: Record<VisitDocument['events'][number]['type'], string> = {
    CREATED: 'Создан черновик',
    GENERATED: 'Документ сформирован и зафиксирован',
    SIGNED: 'Подпись подтверждена',
    CANCELLED: 'Документ отменён',
    DELIVERY_QUEUED: `Поставлен в очередь отправки${channel ? ` · ${channel}` : ''}`,
    PRINTED: 'PDF открыт для печати',
  };
  return labels[type];
}

function getDocumentEventColor(type: VisitDocument['events'][number]['type']) {
  if (type === 'SIGNED') return 'green';
  if (type === 'CANCELLED') return 'red';
  return 'blue';
}

function formatDeliveryStatus(status: string) {
  const labels: Record<string, string> = {
    QUEUED: 'в очереди',
    PROCESSING: 'отправляется',
    SENT: 'доставлено',
    FAILED: 'ошибка',
    CANCELLED: 'отменено',
  };
  return labels[status] ?? status;
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
  const content = getFrozenDocumentContent(document);

  return {
    channel: target.channel,
    recipient: target.recipient,
    ownerId: visit.ownerId,
    animalId: visit.animalId,
    visitDocumentId: document.id,
    subject: `Документ TemichevVet: ${content.title}`,
    body: [
      `${visit.owner.fullName}, документ "${content.title}" по пациенту ${visit.animal.nickname} поставлен в отправку через ${channelLabel}.`,
      `Дата приёма: ${visitDate}.`,
      'Документ также доступен в личном кабинете владельца.',
      '',
      content.body,
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
