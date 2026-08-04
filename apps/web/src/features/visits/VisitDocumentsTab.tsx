import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  PlusOutlined,
  PrinterOutlined,
  SendOutlined,
} from '@ant-design/icons';
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

const documentSchema = z
  .object({
    templateId: z.string().optional(),
    title: z.string().trim().optional(),
    body: z.string().trim().optional(),
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
        ? updateVisitDocument(visit.id, editingDocument.id, values)
        : createVisitDocument(visit.id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] }),
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      message.success(editingDocument ? 'Черновик обновлён' : 'Черновик сохранён');
      closeDrawer();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const generateMutation = useMutation({
    mutationFn: (values: DocumentFormValues) =>
      editingDocument
        ? updateVisitDocument(visit.id, editingDocument.id, { ...values, status: 'GENERATED' })
        : createVisitDocument(visit.id, { ...values, status: 'GENERATED' }),
    onSuccess: async () => {
      await refreshDocuments();
      message.success('Документ сформирован. Теперь его можно подписать или распечатать.');
      closeDrawer();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ document, status }: { document: VisitDocument; status: 'GENERATED' | 'SIGNED' | 'CANCELLED' }) =>
      updateVisitDocument(visit.id, document.id, { status }),
    onSuccess: async (document) => {
      await refreshDocuments();
      const successMessages: Record<'GENERATED' | 'SIGNED' | 'CANCELLED', string> = {
        GENERATED: 'Документ сформирован. Теперь его можно подписать или распечатать.',
        SIGNED: 'Документ подписан и сохранён в истории.',
        CANCELLED: 'Документ отменён и сохранён в истории.',
      };
      message.success(successMessages[document.status as 'GENERATED' | 'SIGNED' | 'CANCELLED']);
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
        width: 520,
        render: (_, record) =>
          (
            <Space wrap>
              {canManage ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  {record.status === 'DRAFT' ? 'Редактировать' : 'Просмотреть'}
                </Button>
              ) : null}
              {canManage && record.status === 'DRAFT' && !record.generatedDocument ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<FileDoneOutlined />}
                  loading={transitionMutation.isPending}
                  onClick={() => confirmGenerate(record)}
                >
                  Сформировать
                </Button>
              ) : null}
              {canManage && record.status === 'GENERATED' ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={transitionMutation.isPending}
                  onClick={() => confirmSign(record)}
                >
                  Подписать
                </Button>
              ) : null}
              {canPrint && record.generatedDocument && record.status !== 'CANCELLED' ? (
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  loading={printingDocumentId === record.id}
                  onClick={() => handlePrint(record)}
                >
                  Печать PDF
                </Button>
              ) : null}
              {canSend && canQueueDocument(record) ? (
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  loading={sendMutation.isPending}
                  disabled={!notificationTarget}
                  onClick={() => sendMutation.mutate(record)}
                >
                  Отправить
                </Button>
              ) : null}
              {canManage && (record.status === 'GENERATED' || record.status === 'SIGNED') ? (
                <Button danger size="small" loading={transitionMutation.isPending} onClick={() => confirmCancel(record)}>
                  Отменить
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
    [
      canManage,
      canPrint,
      canSend,
      deleteMutation.isPending,
      notificationTarget,
      printingDocumentId,
      sendMutation,
      transitionMutation.isPending,
    ],
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

  function confirmGenerate(document: VisitDocument) {
    modal.confirm({
      title: 'Сформировать документ?',
      content:
        'Будет создан и сохранён точный PDF этого документа. После формирования текст изменить нельзя, но документ можно подписать, распечатать или отправить клиенту.',
      okText: 'Сформировать',
      cancelText: 'Вернуться к проверке',
      onOk: () => transitionMutation.mutateAsync({ document, status: 'GENERATED' }),
    });
  }

  function confirmGenerateFromEditor(values: DocumentFormValues) {
    modal.confirm({
      title: 'Сформировать документ?',
      content:
        'Сначала будут сохранены текущие данные, затем будет создан точный PDF. После формирования текст изменить нельзя.',
      okText: 'Сформировать',
      cancelText: 'Вернуться к проверке',
      onOk: () => generateMutation.mutateAsync(values),
    });
  }

  function confirmSign(document: VisitDocument) {
    modal.confirm({
      title: 'Подписать документ?',
      content: `Подтвердите, что документ «${document.title}» проверен и принят врачом.`,
      okText: 'Подписать',
      cancelText: 'Отмена',
      onOk: () => transitionMutation.mutateAsync({ document, status: 'SIGNED' }),
    });
  }

  function confirmCancel(document: VisitDocument) {
    modal.confirm({
      title: 'Отменить документ?',
      content: `Документ «${document.title}» останется в истории со статусом «Отменён», но его нельзя будет отправить или распечатать как действующий.`,
      okText: 'Отменить документ',
      cancelText: 'Назад',
      okButtonProps: { danger: true },
      onOk: () => transitionMutation.mutateAsync({ document, status: 'CANCELLED' }),
    });
  }

  function openCreate() {
    setEditingDocument(null);
    reset({ templateId: undefined, title: '', body: '' });
    setDrawerOpen(true);
  }

  function openEdit(document: VisitDocument) {
    setEditingDocument(document);
    reset({
      templateId: document.templateId ?? undefined,
      title: document.title,
      body: document.body ?? '',
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingDocument(null);
    reset({ templateId: undefined, title: '', body: '' });
  }

  async function handlePrint(document: VisitDocument) {
    if (!document.generatedDocument) {
      message.warning('Сначала сформируйте документ. После этого появится точный PDF для печати.');
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

  async function refreshDocuments() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] }),
      queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
      queryClient.invalidateQueries({ queryKey: ['visits'] }),
    ]);
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
        title={
          !editingDocument
            ? 'Новый документ приёма'
            : editingDocument.status === 'DRAFT'
              ? 'Редактирование черновика'
              : 'Просмотр документа'
        }
        width={760}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        extra={
          <Space>
            {editingDocument?.generatedDocument && editingDocument.status !== 'CANCELLED' && canPrint ? (
              <Button
                icon={<PrinterOutlined />}
                loading={printingDocumentId === editingDocument.id}
                onClick={() => handlePrint(editingDocument)}
              >
                Печать PDF
              </Button>
            ) : null}
            {editingDocument && canSend && canQueueDocument(editingDocument) ? (
              <Button
                icon={<SendOutlined />}
                loading={sendMutation.isPending}
                disabled={!notificationTarget}
                onClick={() => sendMutation.mutate(editingDocument)}
              >
                Отправить
              </Button>
            ) : null}
            {editingDocument?.status === 'GENERATED' && canManage ? (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={transitionMutation.isPending}
                onClick={() => confirmSign(editingDocument)}
              >
                Подписать
              </Button>
            ) : null}
            {editingDocument && canManage && (editingDocument.status === 'GENERATED' || editingDocument.status === 'SIGNED') ? (
              <Button danger loading={transitionMutation.isPending} onClick={() => confirmCancel(editingDocument)}>
                Отменить
              </Button>
            ) : null}
            {editingDocument && canManage && canDeleteVisitDocument(editingDocument) ? (
              <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} onClick={() => confirmDelete(editingDocument)}>
                Удалить
              </Button>
            ) : null}
            {canManage && (!editingDocument || editingDocument.status === 'DRAFT') ? (
              <Button loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))}>
                Сохранить черновик
              </Button>
            ) : null}
            {canManage && (!editingDocument || editingDocument.status === 'DRAFT') ? (
              <Button
                type="primary"
                icon={<FileDoneOutlined />}
                loading={generateMutation.isPending}
                onClick={handleSubmit(confirmGenerateFromEditor)}
              >
                Сформировать
              </Button>
            ) : null}
          </Space>
        }
      >
        <Form layout="vertical">
          {!documentFrozen ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Сначала проверьте документ"
              description="Черновик можно сохранить и продолжить позже. Когда текст готов, нажмите «Сформировать» — система создаст неизменяемый PDF и откроет действия «Подписать», «Печать PDF» и «Отправить»."
            />
          ) : null}
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
            <Form.Item label="Состояние">
              <Space direction="vertical" size={2}>
                <Tag color={documentStatusColors[editingDocument?.status ?? 'DRAFT']}>
                  {documentStatusLabels[editingDocument?.status ?? 'DRAFT']}
                </Tag>
                <Typography.Text type="secondary">
                  {getDocumentStateHint(editingDocument?.status ?? 'DRAFT')}
                </Typography.Text>
              </Space>
            </Form.Item>
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

function getDocumentStateHint(status: DocumentStatus) {
  const hints: Record<DocumentStatus, string> = {
    DRAFT: 'Можно редактировать. Печать появится после формирования.',
    GENERATED: 'Текст зафиксирован. Документ можно подписать, распечатать или отправить.',
    SIGNED: 'Документ подписан и сохранён в истории.',
    CANCELLED: 'Документ отменён и сохранён только для истории.',
  };
  return hints[status];
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
