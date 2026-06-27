import {
  BellOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  MessageOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  cleanupLearnedMedicalPhrases,
  createMedicalPhrase,
  manageMedicalPhrases,
  removeMedicalPhrase,
  updateMedicalPhrase,
} from '../medicalPhrases/medicalPhrases.api';
import { MedicalPhrase, MedicalPhraseSource, UpsertMedicalPhrasePayload } from '../medicalPhrases/types';
import { listNotificationTemplates, upsertNotificationTemplate } from '../notifications/notifications.api';
import { notificationChannelLabels, NotificationTemplate, UpsertNotificationTemplateInput } from '../notifications/types';
import { createDocumentTemplate, listDocumentTemplates, updateDocumentTemplate } from './documents.api';
import { DocumentVariablePalette } from './DocumentVariablePalette';
import { DocumentTemplate } from './types';

const textTemplatePageSize = 20;

const documentTemplateSchema = z.object({
  title: z.string().trim().min(2, 'Укажите название').max(200),
  categoryTitle: z.string().trim().max(120).optional(),
  body: z.string().trim().max(20000).optional(),
});

const textTemplateFieldOptions = [
  { value: 'visit.exam.anamnesis', label: 'Приём: анамнез' },
  { value: 'visit.exam.examination', label: 'Приём: осмотр' },
  { value: 'visit.exam.symptoms', label: 'Приём: симптомы' },
  { value: 'visit.exam.manipulations', label: 'Приём: манипуляции' },
  { value: 'visit.exam.comment', label: 'Приём: внутренний комментарий' },
  { value: 'visit.recommendation.treatmentPlan', label: 'Приём: план лечения' },
  { value: 'visit.recommendation.careNotes', label: 'Приём: рекомендации владельцу' },
  { value: 'laboratory.result', label: 'Анализы / исследования' },
];

const textTemplateSourceOptions: Array<{ value: MedicalPhraseSource; label: string }> = [
  { value: 'SYSTEM', label: 'Общий текстовый шаблон' },
  { value: 'DIAGNOSIS_TEMPLATE', label: 'Шаблон по диагнозу' },
  { value: 'EMPLOYEE', label: 'Самообучение врача' },
];

const speciesOptions = [
  { value: 'Кошка', label: 'Кошка' },
  { value: 'Собака', label: 'Собака' },
  { value: 'Птица', label: 'Птица' },
  { value: 'Рептилия', label: 'Рептилия' },
  { value: 'Грызун', label: 'Грызун' },
  { value: 'Лошадь', label: 'Лошадь' },
];

const textTemplateSchema = z
  .object({
    field: z.string().trim().min(2, 'Выберите раздел'),
    source: z.enum(['SYSTEM', 'DIAGNOSIS_TEMPLATE', 'EMPLOYEE']),
    title: z.string().trim().min(2, 'Укажите название').max(160, 'Слишком длинное название'),
    text: z.string().trim().min(2, 'Введите текст').max(4000, 'Слишком длинный текст'),
    category: z.string().trim().max(120).optional(),
    species: z.string().trim().max(120).optional(),
    diagnosis: z.string().trim().max(240).optional(),
    isActive: z.boolean(),
  })
  .refine((value) => value.source !== 'DIAGNOSIS_TEMPLATE' || Boolean(value.diagnosis?.trim()), {
    path: ['diagnosis'],
    message: 'Для шаблона по диагнозу укажите диагноз',
  });

const notificationTemplateSchema = z.object({
  channel: z.string().trim().min(2, 'Укажите канал').max(80),
  eventCode: z.string().trim().min(2, 'Укажите событие').max(120),
  title: z.string().trim().min(2, 'Укажите название').max(200),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, 'Введите текст шаблона').max(4000),
  isActive: z.boolean(),
});

type DocumentTemplateFormValues = z.infer<typeof documentTemplateSchema>;
type TextTemplateFormValues = z.infer<typeof textTemplateSchema>;
type NotificationTemplateFormValues = z.infer<typeof notificationTemplateSchema>;

const notificationChannelOptions = Object.entries(notificationChannelLabels).map(([value, label]) => ({ value, label }));

const notificationEventLabels: Record<string, string> = {
  appointment_created: 'Запись создана',
  appointment_reminder: 'Напоминание о записи',
  vaccination_reminder: 'Напоминание о вакцинации',
  visit_followup: 'После приёма',
  payment_reminder: 'Напоминание об оплате',
  lab_result_ready: 'Готов результат анализа',
};

const notificationVariableGroups = [
  {
    title: 'Клиника',
    variables: [
      ['clinic.name', 'Название клиники'],
      ['clinic.address', 'Адрес клиники'],
      ['office.phone', 'Телефон филиала'],
    ],
  },
  {
    title: 'Владелец',
    variables: [
      ['owner.fullName', 'ФИО владельца'],
      ['owner.phone', 'Телефон'],
      ['owner.email', 'Email'],
    ],
  },
  {
    title: 'Пациент',
    variables: [
      ['animal.nickname', 'Кличка'],
      ['animal.species', 'Вид'],
      ['animal.breed', 'Порода'],
    ],
  },
  {
    title: 'Запись',
    variables: [
      ['appointment.date', 'Дата'],
      ['appointment.time', 'Время'],
      ['appointment.startsAt', 'Дата и время'],
    ],
  },
] as const;

export function DocumentTemplatesPage() {
  const { data: auth } = useCurrentEmployee();
  const canManageDocuments = hasPermission(auth?.employee, 'documents.manage');
  const canManageText = hasPermission(auth?.employee, 'settings.manage');
  const canReadNotifications = hasPermission(auth?.employee, 'notifications.read');
  const canManageNotifications = hasPermission(auth?.employee, 'notifications.manage');

  return (
    <div className="page">
      <PageHeader
        title="Шаблоны"
        description="Текстовые шаблоны, составные документы и уведомления клиники."
      />
      <Tabs
        items={[
          {
            key: 'text',
            label: (
              <Space size={6}>
                <MessageOutlined />
                Текстовые
              </Space>
            ),
            children: <TextTemplatesPanel canManage={canManageText} />,
          },
          {
            key: 'documents',
            label: (
              <Space size={6}>
                <FileTextOutlined />
                Составные / документы
              </Space>
            ),
            children: <DocumentTemplatesPanel canManage={canManageDocuments} />,
          },
          {
            key: 'notifications',
            label: (
              <Space size={6}>
                <BellOutlined />
                Уведомлений
              </Space>
            ),
            children: <NotificationTemplatesPanel canRead={canReadNotifications} canManage={canManageNotifications} />,
          },
        ]}
      />
    </div>
  );
}

function TextTemplatesPanel({ canManage }: { canManage: boolean }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState<{
    field?: string;
    source?: MedicalPhraseSource;
    isActive?: boolean;
    search?: string;
    species?: string;
    diagnosis?: string;
  }>({ isActive: true, source: 'SYSTEM' });
  const [editingTemplate, setEditingTemplate] = useState<MedicalPhrase | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const offset = (page - 1) * textTemplatePageSize;
  const templatesQuery = useQuery({
    queryKey: ['medical-phrases', 'manage', 'templates-center', filters, page],
    queryFn: () => manageMedicalPhrases({ ...filters, limit: textTemplatePageSize, offset }),
    enabled: canManage,
  });
  const { control, handleSubmit, reset, watch } = useForm<TextTemplateFormValues>({
    resolver: zodResolver(textTemplateSchema),
    defaultValues: getEmptyTextTemplateFormValues(),
  });
  const selectedSource = watch('source');
  const saveMutation = useMutation({
    mutationFn: (values: TextTemplateFormValues) =>
      editingTemplate ? updateMedicalPhrase(editingTemplate.id, toTextTemplatePayload(values, editingTemplate)) : createMedicalPhrase(toTextTemplatePayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success(editingTemplate ? 'Текстовый шаблон обновлён' : 'Текстовый шаблон создан');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const toggleMutation = useMutation({
    mutationFn: (template: MedicalPhrase) => updateMedicalPhrase(template.id, phraseToTextTemplatePayload(template, { isActive: !template.isActive })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('Статус шаблона обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const removeMutation = useMutation({
    mutationFn: removeMedicalPhrase,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('mode' in result ? 'Самообученный шаблон удалён' : 'Шаблон отключён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const cleanupMutation = useMutation({
    mutationFn: cleanupLearnedMedicalPhrases,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success(`Очищено фраз: ${result.deletedCount}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<MedicalPhrase>>(
    () => [
      {
        title: 'Название',
        dataIndex: 'title',
        key: 'title',
        width: 320,
        render: (_, record) => (
          <Space direction="vertical" size={2} className="full-width">
            <Typography.Text strong>{record.title}</Typography.Text>
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="medical-phrase-preview">
              {record.text}
            </Typography.Paragraph>
          </Space>
        ),
      },
      {
        title: 'Раздел',
        dataIndex: 'field',
        key: 'field',
        width: 190,
        render: getTextTemplateFieldLabel,
      },
      {
        title: 'Тип',
        dataIndex: 'source',
        key: 'source',
        width: 180,
        render: (value: MedicalPhraseSource, record) => (
          <Space direction="vertical" size={2}>
            <Tag color={getTextTemplateSourceColor(value)}>{getTextTemplateSourceLabel(value)}</Tag>
            {record.employee ? <Typography.Text type="secondary">{record.employee.fullName}</Typography.Text> : null}
          </Space>
        ),
      },
      {
        title: 'Привязка',
        key: 'scope',
        width: 240,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Typography.Text>{record.category || 'Без категории'}</Typography.Text>
            <Typography.Text type="secondary">
              {[record.species, record.diagnosis].filter(Boolean).join(' / ') || 'Для всех'}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Статус',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 120,
        render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? 'Активен' : 'Выключен'}</Tag>,
      },
      { title: 'Исп.', dataIndex: 'usageCount', key: 'usageCount', width: 80 },
      {
        title: 'Обновлён',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 150,
        render: (value: string) => new Date(value).toLocaleString('ru-RU'),
      },
      {
        title: '',
        key: 'actions',
        width: 250,
        fixed: 'right',
        render: (_, record) => (
          <Space wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Открыть
            </Button>
            {record.source === 'EMPLOYEE' ? (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmRemove(record)}>
                Удалить
              </Button>
            ) : (
              <>
                <Button size="small" loading={toggleMutation.isPending} onClick={() => toggleMutation.mutate(record)}>
                  {record.isActive ? 'Отключить' : 'Включить'}
                </Button>
                {record.isActive ? (
                  <Tooltip title="Шаблон останется в истории, но пропадёт из подсказок">
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmRemove(record)}>
                      Убрать
                    </Button>
                  </Tooltip>
                ) : null}
              </>
            )}
          </Space>
        ),
      },
    ],
    [removeMutation.isPending, toggleMutation.isPending],
  );

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function openCreate() {
    setEditingTemplate(null);
    reset(getEmptyTextTemplateFormValues());
    setModalOpen(true);
  }

  function openEdit(template: MedicalPhrase) {
    setEditingTemplate(template);
    reset({
      field: template.field,
      source: template.source,
      title: template.title,
      text: template.text,
      category: template.category ?? '',
      species: template.species ?? '',
      diagnosis: template.diagnosis ?? '',
      isActive: template.isActive,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTemplate(null);
    reset(getEmptyTextTemplateFormValues());
  }

  function submitSearch() {
    setFilters((current) => ({ ...current, search: searchDraft.trim() || undefined }));
    setPage(1);
  }

  function resetFilters() {
    setSearchDraft('');
    setFilters({ isActive: true, source: 'SYSTEM' });
    setPage(1);
  }

  function confirmRemove(template: MedicalPhrase) {
    modal.confirm({
      title: template.source === 'EMPLOYEE' ? 'Удалить самообученный шаблон?' : 'Отключить шаблон?',
      content:
        template.source === 'EMPLOYEE'
          ? 'Шаблон будет удалён из личных подсказок врача.'
          : 'Шаблон останется в справочнике, но пропадёт из быстрых подсказок в приёме.',
      okText: template.source === 'EMPLOYEE' ? 'Удалить' : 'Отключить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => removeMutation.mutate(template.id),
    });
  }

  function confirmCleanupLearned() {
    modal.confirm({
      title: 'Очистить самообученные шаблоны?',
      content: filters.field
        ? `Будут удалены самообученные фразы только из раздела «${getTextTemplateFieldLabel(filters.field)}».`
        : 'Будут удалены все самообученные фразы врачей. Общие шаблоны и шаблоны диагнозов не изменятся.',
      okText: 'Очистить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => cleanupMutation.mutate({ field: filters.field }),
    });
  }

  if (!canManage) {
    return (
      <div className="list-panel">
        <div className="list-panel-body">
          <Alert type="warning" showIcon message="Недостаточно прав для управления текстовыми шаблонами." />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap className="medical-phrases-filters">
            <Input.Search
              allowClear
              placeholder="Поиск по названию, тексту, категории, врачу"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onSearch={submitSearch}
              enterButton
              className="medical-phrases-search"
            />
            <Select allowClear placeholder="Раздел" value={filters.field} options={textTemplateFieldOptions} onChange={(value) => updateFilter('field', value)} />
            <Select allowClear placeholder="Тип" value={filters.source} options={textTemplateSourceOptions} onChange={(value) => updateFilter('source', value)} />
            <Select
              allowClear
              placeholder="Статус"
              value={filters.isActive}
              options={[
                { value: true, label: 'Активные' },
                { value: false, label: 'Выключенные' },
              ]}
              onChange={(value) => updateFilter('isActive', value)}
            />
            <Select allowClear showSearch placeholder="Вид" value={filters.species} options={speciesOptions} onChange={(value) => updateFilter('species', value)} />
            <Input
              allowClear
              placeholder="Диагноз"
              value={filters.diagnosis}
              onChange={(event) => updateFilter('diagnosis', event.target.value || undefined)}
              className="medical-phrases-diagnosis-filter"
            />
            <Button icon={<ReloadOutlined />} onClick={resetFilters}>
              Сбросить
            </Button>
            <Button danger icon={<DeleteOutlined />} loading={cleanupMutation.isPending} onClick={confirmCleanupLearned}>
              Очистить самообученные
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Добавить текстовый
            </Button>
          </Space>
        </div>
        <div className="list-panel-body">
          {templatesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(templatesQuery.error)} className="form-alert" /> : null}
          <Table<MedicalPhrase>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={templatesQuery.data?.items ?? []}
            loading={templatesQuery.isLoading}
            scroll={{ x: 1540 }}
            pagination={{
              current: page,
              pageSize: textTemplatePageSize,
              total: templatesQuery.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            onRow={(record) => ({ onDoubleClick: () => openEdit(record) })}
          />
        </div>
      </div>
      <TextTemplateModal
        open={modalOpen}
        editingTemplate={editingTemplate}
        selectedSource={selectedSource}
        control={control}
        loading={saveMutation.isPending}
        onClose={closeModal}
        onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
      />
    </>
  );
}

function DocumentTemplatesPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const templatesQuery = useQuery({ queryKey: ['document-templates'], queryFn: listDocumentTemplates });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const { control, getValues, handleSubmit, reset, setValue, watch } = useForm<DocumentTemplateFormValues>({
    resolver: zodResolver(documentTemplateSchema),
    defaultValues: { title: '', categoryTitle: '', body: '' },
  });
  const previewTitle = watch('title');
  const previewBody = watch('body');
  const saveMutation = useMutation({
    mutationFn: (values: DocumentTemplateFormValues) =>
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
        render: (_, record) => (
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
    <>
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap className="full-width" style={{ justifyContent: 'space-between' }}>
            <Typography.Title level={4} className="compact-title">
              Составные документы
            </Typography.Title>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Создать документ
              </Button>
            ) : null}
          </Space>
        </div>
        <div className="list-panel-body">
          {templatesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(templatesQuery.error)} className="form-alert" /> : null}
          <Table<DocumentTemplate>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            pagination={false}
            onRow={(record) => ({ onDoubleClick: () => canManage && openEdit(record) })}
          />
        </div>
      </div>
      <Modal
        title={editingTemplate ? 'Редактирование документа' : 'Новый документ'}
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
            <Card size="small" title="Предпросмотр">
              <div className="document-preview">
                <h3>{previewTitle || 'Без названия'}</h3>
                <div>{previewBody || 'Текст шаблона пока пустой'}</div>
              </div>
            </Card>
          </div>
        </Form>
      </Modal>
    </>
  );
}

function NotificationTemplatesPanel({ canRead, canManage }: { canRead: boolean; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const templatesQuery = useQuery({
    queryKey: ['notifications', 'templates'],
    queryFn: () => listNotificationTemplates(),
    enabled: canRead,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const { control, getValues, handleSubmit, reset, setValue, watch } = useForm<NotificationTemplateFormValues>({
    resolver: zodResolver(notificationTemplateSchema),
    defaultValues: getEmptyNotificationTemplateFormValues(),
  });
  const previewBody = watch('body');
  const previewSubject = watch('subject');
  const saveMutation = useMutation({
    mutationFn: (values: NotificationTemplateFormValues) => upsertNotificationTemplate(toNotificationTemplatePayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] });
      message.success('Шаблон уведомления сохранён');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<NotificationTemplate>>(
    () => [
      {
        title: 'Канал',
        dataIndex: 'channel',
        key: 'channel',
        width: 130,
        render: formatNotificationChannel,
      },
      {
        title: 'Событие',
        dataIndex: 'eventCode',
        key: 'eventCode',
        width: 210,
        render: (value: string) => notificationEventLabels[value] ?? value,
      },
      {
        title: 'Название',
        dataIndex: 'title',
        key: 'title',
        width: 220,
        render: (value: string, template) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            {template.subject ? <Typography.Text type="secondary">{template.subject}</Typography.Text> : null}
          </Space>
        ),
      },
      {
        title: 'Текст',
        dataIndex: 'body',
        key: 'body',
        ellipsis: true,
      },
      {
        title: 'Статус',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 110,
        render: (value: boolean) => (value ? <Tag color="green">Активен</Tag> : <Tag>Выключен</Tag>),
      },
      {
        title: '',
        key: 'actions',
        width: 120,
        render: (_, template) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(template)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage],
  );

  function openCreate() {
    setEditingTemplate(null);
    reset(getEmptyNotificationTemplateFormValues());
    setModalOpen(true);
  }

  function openEdit(template: NotificationTemplate) {
    setEditingTemplate(template);
    reset({
      channel: template.channel,
      eventCode: template.eventCode,
      title: template.title,
      subject: template.subject ?? '',
      body: template.body,
      isActive: template.isActive,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTemplate(null);
    reset(getEmptyNotificationTemplateFormValues());
  }

  function insertNotificationVariable(variable: string) {
    const body = getValues('body') ?? '';
    const separator = body && !body.endsWith(' ') && !body.endsWith('\n') ? ' ' : '';
    setValue('body', `${body}${separator}{${variable}}`, { shouldDirty: true });
  }

  if (!canRead) {
    return (
      <div className="list-panel">
        <div className="list-panel-body">
          <Alert type="warning" showIcon message="Недостаточно прав для просмотра шаблонов уведомлений." />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap className="full-width" style={{ justifyContent: 'space-between' }}>
            <Typography.Title level={4} className="compact-title">
              Шаблоны уведомлений
            </Typography.Title>
            {canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Добавить уведомление
              </Button>
            ) : null}
          </Space>
        </div>
        <div className="list-panel-body">
          {templatesQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(templatesQuery.error)} className="form-alert" /> : null}
          <Table<NotificationTemplate>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            pagination={false}
            scroll={{ x: 980 }}
            onRow={(template) => ({
              onDoubleClick: () => {
                if (canManage) {
                  openEdit(template);
                }
              },
            })}
          />
        </div>
      </div>
      <Modal
        title={editingTemplate ? 'Редактирование уведомления' : 'Новый шаблон уведомления'}
        open={modalOpen}
        onCancel={closeModal}
        width={780}
        destroyOnHidden
        footer={
          <Space>
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
              name="channel"
              render={({ field, fieldState }) => (
                <Form.Item label="Канал" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Select {...field} disabled={Boolean(editingTemplate)} options={notificationChannelOptions} />
                </Form.Item>
              )}
            />
            <Controller
              control={control}
              name="eventCode"
              render={({ field, fieldState }) => (
                <Form.Item label="Событие" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} disabled={Boolean(editingTemplate)} placeholder="appointment_reminder" />
                </Form.Item>
              )}
            />
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
              name="subject"
              render={({ field, fieldState }) => (
                <Form.Item label="Тема" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                  <Input {...field} />
                </Form.Item>
              )}
            />
          </div>
          <Controller
            control={control}
            name="body"
            render={({ field, fieldState }) => (
              <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input.TextArea {...field} rows={7} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Form.Item>
                <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                  Активен
                </Checkbox>
              </Form.Item>
            )}
          />
          <div className="document-editor-grid">
            <Card size="small" title="Переменные">
              <NotificationVariablePalette onInsert={insertNotificationVariable} />
            </Card>
            <Card size="small" title="Предпросмотр">
              <Space direction="vertical" className="full-width">
                {previewSubject ? <Typography.Text strong>{renderNotificationPreview(previewSubject)}</Typography.Text> : null}
                <Typography.Paragraph className="notification-message-box">
                  {renderNotificationPreview(previewBody || 'Текст шаблона пока пустой')}
                </Typography.Paragraph>
              </Space>
            </Card>
          </div>
        </Form>
      </Modal>
    </>
  );
}

function TextTemplateModal({
  open,
  editingTemplate,
  selectedSource,
  control,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editingTemplate: MedicalPhrase | null;
  selectedSource: MedicalPhraseSource;
  control: ReturnType<typeof useForm<TextTemplateFormValues>>['control'];
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title={editingTemplate ? 'Редактировать текстовый шаблон' : 'Новый текстовый шаблон'}
      open={open}
      onCancel={onClose}
      width={820}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={loading} onClick={onSubmit}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="field"
            render={({ field, fieldState }) => (
              <Form.Item label="Раздел" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select {...field} options={textTemplateFieldOptions} placeholder="Выберите раздел" />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="source"
            render={({ field, fieldState }) => (
              <Form.Item label="Тип" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  options={editingTemplate?.source === 'EMPLOYEE' ? textTemplateSourceOptions : textTemplateSourceOptions.filter((option) => option.value !== 'EMPLOYEE')}
                  disabled={editingTemplate?.source === 'EMPLOYEE'}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus placeholder="Короткое название в списке" />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="category"
            render={({ field, fieldState }) => (
              <Form.Item label="Категория" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} placeholder="Например: ЖКТ, кожа, дыхание" />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="species"
            render={({ field, fieldState }) => (
              <Form.Item label="Вид животного" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select {...field} allowClear showSearch options={speciesOptions} placeholder="Для всех видов" />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="diagnosis"
            render={({ field, fieldState }) => (
              <Form.Item
                label={selectedSource === 'DIAGNOSIS_TEMPLATE' ? 'Диагноз' : 'Диагноз / привязка'}
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message}
              >
                <Input {...field} placeholder="Например: гастроэнтерит" />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="text"
          render={({ field, fieldState }) => (
            <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea {...field} rows={8} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Form.Item label="Показывать в подсказках">
              <Switch checked={field.value} onChange={field.onChange} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function NotificationVariablePalette({ onInsert }: { onInsert: (variable: string) => void }) {
  return (
    <Space direction="vertical" size={10} className="full-width">
      {notificationVariableGroups.map((group) => (
        <div className="document-variable-group" key={group.title}>
          <Typography.Text strong>{group.title}</Typography.Text>
          <div className="document-variable-list">
            {group.variables.map(([variable, label]) => (
              <Button key={variable} size="small" onClick={() => onInsert(variable)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </Space>
  );
}

function getEmptyTextTemplateFormValues(): TextTemplateFormValues {
  return {
    field: 'visit.exam.anamnesis',
    source: 'SYSTEM',
    title: '',
    text: '',
    category: '',
    species: '',
    diagnosis: '',
    isActive: true,
  };
}

function getEmptyNotificationTemplateFormValues(): NotificationTemplateFormValues {
  return {
    channel: 'TELEGRAM',
    eventCode: 'appointment_reminder',
    title: '',
    subject: '',
    body: '',
    isActive: true,
  };
}

function toTextTemplatePayload(values: TextTemplateFormValues, editingTemplate?: MedicalPhrase | null): UpsertMedicalPhrasePayload {
  return {
    field: values.field,
    title: values.title,
    text: values.text,
    category: values.category || null,
    species: values.species || null,
    diagnosis: values.diagnosis || null,
    source: values.source === 'EMPLOYEE' ? (editingTemplate?.source === 'EMPLOYEE' ? undefined : 'SYSTEM') : values.source,
    isActive: values.isActive,
  };
}

function phraseToTextTemplatePayload(phrase: MedicalPhrase, override: Partial<TextTemplateFormValues>): UpsertMedicalPhrasePayload {
  return toTextTemplatePayload(
    {
      field: phrase.field,
      source: phrase.source,
      title: phrase.title,
      text: phrase.text,
      category: phrase.category ?? '',
      species: phrase.species ?? '',
      diagnosis: phrase.diagnosis ?? '',
      isActive: phrase.isActive,
      ...override,
    },
    phrase,
  );
}

function toNotificationTemplatePayload(values: NotificationTemplateFormValues): UpsertNotificationTemplateInput {
  return {
    channel: values.channel,
    eventCode: values.eventCode,
    title: values.title,
    subject: values.subject || null,
    body: values.body,
    isActive: values.isActive,
  };
}

function getTextTemplateFieldLabel(value: string) {
  return textTemplateFieldOptions.find((option) => option.value === value)?.label ?? value;
}

function getTextTemplateSourceLabel(value: MedicalPhraseSource) {
  return textTemplateSourceOptions.find((option) => option.value === value)?.label ?? value;
}

function getTextTemplateSourceColor(value: MedicalPhraseSource) {
  if (value === 'EMPLOYEE') {
    return 'purple';
  }

  if (value === 'DIAGNOSIS_TEMPLATE') {
    return 'blue';
  }

  return 'green';
}

function formatNotificationChannel(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  return (notificationChannelLabels as Record<string, string>)[value] ?? value;
}

function renderNotificationPreview(text: string) {
  const values: Record<string, string> = {
    'clinic.name': 'TemichevVet',
    'clinic.address': 'Адрес клиники',
    'office.phone': '+7 (000) 000-00-00',
    'owner.fullName': 'Иванова Анна',
    'owner.phone': '+7 (900) 000-00-00',
    'owner.email': 'owner@example.ru',
    'animal.nickname': 'Барсик',
    'animal.species': 'Кошка',
    'animal.breed': 'Бенгальская',
    'appointment.date': '25.06.2026',
    'appointment.time': '10:30',
    'appointment.startsAt': '25.06.2026, 10:30',
    currentDate: new Date().toLocaleDateString('ru-RU'),
  };

  return text.replace(/\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g, (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) => {
    const key = singleBraceKey ?? doubleBraceKey;
    return key ? (values[key] ?? '') : '';
  });
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
