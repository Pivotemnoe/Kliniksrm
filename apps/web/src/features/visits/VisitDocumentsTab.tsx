import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  MoreOutlined,
  PlusOutlined,
  PrinterOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Drawer, Dropdown, Form, Input, Select, Space, Table, Timeline, Typography } from 'antd';
import type { MenuProps } from 'antd';
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
import { VisitDocument } from '../documents/types';
import { DocumentVisualEditor } from '../documents/DocumentVisualEditor';
import { createDefaultDocumentLayout, documentLayoutToPlainText, DocumentLayout } from '../documents/documentLayout';
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
  const [documentLayout, setDocumentLayout] = useState<DocumentLayout | null>(null);
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
  const documentEditable = canManage && !documentFrozen;
  const saveMutation = useMutation({
    mutationFn: (values: DocumentFormValues) => {
      const input = documentLayout
        ? { ...values, body: documentLayoutToPlainText(documentLayout), layout: documentLayout }
        : values;
      return editingDocument
        ? updateVisitDocument(visit.id, editingDocument.id, input)
        : createVisitDocument(visit.id, input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] }),
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      message.success('Документ сохранён. К нему можно вернуться позже.');
      closeDrawer();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const finalizeMutation = useMutation({
    mutationFn: async ({ values, printWindow }: { values: DocumentFormValues; printWindow: Window }) => {
      const input = documentLayout
        ? { ...values, body: documentLayoutToPlainText(documentLayout), layout: documentLayout, status: 'GENERATED' as const }
        : { ...values, status: 'GENERATED' as const };
      const document = editingDocument
        ? await updateVisitDocument(visit.id, editingDocument.id, input)
        : await createVisitDocument(visit.id, input);
      return { document, printWindow };
    },
    onSuccess: async ({ document, printWindow }) => {
      await refreshDocuments();
      const opened = await openDocumentPdf(document, printWindow);
      if (opened) {
        message.success('Готово. Точная версия сохранена, PDF открыт для печати.');
      } else {
        message.warning('Документ сохранён, но PDF не открылся. Распечатайте его из списка документов.');
      }
      closeDrawer();
    },
    onError: (error, variables) => {
      variables.printWindow.close();
      message.error(getErrorMessage(error));
    },
  });
  const transitionMutation = useMutation({
    mutationFn: ({ document, status }: { document: VisitDocument; status: 'SIGNED' | 'CANCELLED' }) =>
      updateVisitDocument(visit.id, document.id, { status }),
    onSuccess: async (document) => {
      await refreshDocuments();
      const successMessages: Record<'SIGNED' | 'CANCELLED', string> = {
        SIGNED: 'Подтверждение подписи сохранено в истории.',
        CANCELLED: 'Документ отменён и сохранён в истории.',
      };
      message.success(successMessages[document.status as 'SIGNED' | 'CANCELLED']);
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
            </Typography.Text>
            {documentRequiresSignature(record) && record.status === 'GENERATED' ? (
              <Typography.Text type="warning">Нужно подтвердить подпись</Typography.Text>
            ) : null}
            {record.status === 'CANCELLED' ? <Typography.Text type="danger">Документ отменён</Typography.Text> : null}
            {record.deliveries.length ? (
              <Typography.Text type="secondary">Отправок: {record.deliveries.length}</Typography.Text>
            ) : null}
          </Space>
        ),
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
        width: 430,
        render: (_, record) => {
          const moreItems: MenuProps['items'] = [];
          if (canManage && (record.status === 'GENERATED' || record.status === 'SIGNED')) {
            moreItems.push({
              key: 'cancel',
              danger: true,
              label: 'Отменить документ',
              onClick: () => confirmCancel(record),
            });
          }
          if (canManage && canDeleteVisitDocument(record)) {
            moreItems.push({
              key: 'delete',
              danger: true,
              icon: <DeleteOutlined />,
              label: 'Удалить рабочую версию',
              onClick: () => confirmDelete(record),
            });
          }

          return (
            <Space wrap>
              {canManage || record.generatedDocument ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  {record.status === 'DRAFT' ? 'Продолжить' : 'Открыть'}
                </Button>
              ) : null}
              {canManage && record.status === 'GENERATED' && documentRequiresSignature(record) ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={transitionMutation.isPending}
                  onClick={() => confirmSign(record)}
                >
                  Подтвердить подпись
                </Button>
              ) : null}
              {canPrint && record.generatedDocument && record.status !== 'CANCELLED' ? (
                <Button
                  type={record.status === 'GENERATED' && !documentRequiresSignature(record) ? 'primary' : 'default'}
                  size="small"
                  icon={<PrinterOutlined />}
                  loading={printingDocumentId === record.id}
                  onClick={() => handlePrint(record)}
                >
                  Печать
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
              {moreItems.length ? (
                <Dropdown menu={{ items: moreItems }} trigger={['click']}>
                  <Button size="small" icon={<MoreOutlined />} aria-label={`Дополнительные действия: ${record.title}`} />
                </Dropdown>
              ) : null}
            </Space>
          );
        },
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
      content: `Рабочая версия «${document.title}» будет удалена без возможности восстановления. Данные приёма не изменятся.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(document.id),
    });
  }

  function confirmSign(document: VisitDocument) {
    modal.confirm({
      title: 'Подтвердить подпись?',
      content: `Подтвердите, что официальный документ «${document.title}» подписан и проверен. Событие останется в истории.`,
      okText: 'Подтвердить подпись',
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
    setDocumentLayout(null);
    reset({ templateId: undefined, title: '', body: '' });
    setDrawerOpen(true);
  }

  function openEdit(document: VisitDocument) {
    setEditingDocument(document);
    setDocumentLayout(document.layout ?? null);
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
    setDocumentLayout(null);
    reset({ templateId: undefined, title: '', body: '' });
  }

  function finalizeAndPrint(values: DocumentFormValues) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      message.error('Браузер заблокировал окно печати');
      return;
    }
    printWindow.document.title = 'Готовим документ';
    printWindow.document.body.innerText = 'TemichevVet готовит точный PDF для печати…';
    finalizeMutation.mutate({ values, printWindow });
  }

  async function handlePrint(document: VisitDocument) {
    await openDocumentPdf(document);
  }

  async function openDocumentPdf(document: VisitDocument, existingWindow?: Window) {
    if (!document.generatedDocument) {
      existingWindow?.close();
      message.warning('Сначала проверьте документ и нажмите «Готово и печать».');
      return false;
    }

    const printWindow = existingWindow ?? window.open('', '_blank');
    if (!printWindow) {
      message.error('Браузер заблокировал окно печати');
      return false;
    }
    setPrintingDocumentId(document.id);
    try {
      const result = await downloadVisitDocumentPdf(visit.id, document.id);
      const url = URL.createObjectURL(result.blob);
      printWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id, 'documents'] });
      return true;
    } catch (error) {
      printWindow.close();
      message.error(getErrorMessage(error));
      return false;
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

  const drawerMoreItems: MenuProps['items'] = [];
  if (editingDocument && canManage && (editingDocument.status === 'GENERATED' || editingDocument.status === 'SIGNED')) {
    drawerMoreItems.push({
      key: 'cancel',
      danger: true,
      label: 'Отменить документ',
      onClick: () => confirmCancel(editingDocument),
    });
  }
  if (editingDocument && canManage && canDeleteVisitDocument(editingDocument)) {
    drawerMoreItems.push({
      key: 'delete',
      danger: true,
      icon: <DeleteOutlined />,
      label: 'Удалить рабочую версию',
      onClick: () => confirmDelete(editingDocument),
    });
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
        width="min(1280px, calc(100vw - 24px))"
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
                Печать
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
            {editingDocument?.status === 'GENERATED' && canManage && documentRequiresSignature(editingDocument) ? (
              <Button
                icon={<CheckOutlined />}
                loading={transitionMutation.isPending}
                onClick={() => confirmSign(editingDocument)}
              >
                Подтвердить подпись
              </Button>
            ) : null}
            {drawerMoreItems.length ? (
              <Dropdown menu={{ items: drawerMoreItems }} trigger={['click']}>
                <Button icon={<MoreOutlined />}>Ещё</Button>
              </Dropdown>
            ) : null}
            {documentEditable ? (
              <Button loading={saveMutation.isPending} onClick={handleSubmit((values) => saveMutation.mutate(values))}>
                Сохранить и закрыть
              </Button>
            ) : null}
            {documentEditable ? (
              <Button
                type="primary"
                icon={<FileDoneOutlined />}
                loading={finalizeMutation.isPending}
                onClick={handleSubmit(finalizeAndPrint)}
              >
                Готово и печать
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
              message="Проверьте текст перед печатью"
              description="Выберите шаблон, исправьте текст при необходимости и нажмите «Готово и печать». CRM сохранит точную окончательную версию и откроет PDF. Если нужно вернуться позже, нажмите «Сохранить и закрыть»."
            />
          ) : null}
          {documentFrozen ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Документ готов и сохранён в истории"
              description="Эта окончательная версия защищена от случайных изменений. Её можно распечатать или отправить владельцу."
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
                  disabled={!documentEditable}
                  options={templateOptions}
                  placeholder="Выберите шаблон"
                  onChange={(value) => {
                    field.onChange(value);
                    const template = (templatesQuery.data ?? []).find((item) => item.id === value);
                    if (template && !editingDocument) {
                      setValue('title', template.title, { shouldDirty: true, shouldValidate: true });
                      setValue('body', template.body ?? '', { shouldDirty: true });
                      setDocumentLayout(template.layout ?? null);
                    } else if (!value && !editingDocument) {
                      setDocumentLayout(null);
                    }
                  }}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} disabled={!documentEditable} placeholder="Например, лист первичного приёма" />
              </Form.Item>
            )}
          />
          {documentLayout ? (
            <DocumentVisualEditor
              value={documentLayout}
              title={previewTitle || 'Без названия'}
              disabled={!documentEditable}
              renderText={(text) => renderVisitDocumentPreview(text, visit)}
              onChange={(layout) => {
                setDocumentLayout(layout);
                setValue('body', documentLayoutToPlainText(layout), { shouldDirty: true });
              }}
            />
          ) : (
            <>
              <Controller
                control={control}
                name="body"
                render={({ field }) => (
                  <Form.Item
                    label="Текст документа"
                    extra={documentEditable ? <Button size="small" onClick={() => setDocumentLayout(createDefaultDocumentLayout(field.value ?? ''))}>Перейти в визуальный A4</Button> : null}
                  >
                    <Input.TextArea {...field} disabled={!documentEditable} rows={16} placeholder="Текст документа" />
                  </Form.Item>
                )}
              />
              <div className="document-editor-grid">
                <Card size="small" title={editingDocument ? 'Проверка' : 'Переменные шаблона'}>
                  {editingDocument ? (
                    <Typography.Text type="secondary">
                      {documentFrozen
                        ? 'Это сохранённая окончательная версия. Изменения шаблона на неё не повлияют.'
                        : 'Переменные уже подставлены. Проверьте текст и исправьте его при необходимости.'}
                    </Typography.Text>
                  ) : (
                    <DocumentVariablePalette onInsert={insertVariable} />
                  )}
                </Card>
                <Card size="small" title="Предпросмотр">
                  <div className="document-preview">
                    <h3>{previewTitle || 'Без названия'}</h3>
                    <div>{renderVisitDocumentPreview(previewBody ?? '', visit) || 'Текст документа пока пустой'}</div>
                  </div>
                </Card>
              </div>
            </>
          )}
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
    'owner.passportData': visit.owner.passportData ?? '',
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

function documentRequiresSignature(document: VisitDocument) {
  return document.templateVersion?.requiresSignature ?? document.template?.requiresSignature ?? false;
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
    CREATED: 'Сохранена рабочая версия',
    GENERATED: 'Сохранена окончательная версия',
    SIGNED: 'Подпись подтверждена',
    CANCELLED: 'Документ отменён',
    DELIVERY_QUEUED: `Поставлен в очередь отправки${channel ? ` · ${channel}` : ''}`,
    PRINTED: 'Документ открыт для печати',
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
