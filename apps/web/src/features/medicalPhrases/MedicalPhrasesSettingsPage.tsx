import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
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
} from './medicalPhrases.api';
import { MedicalPhrase, MedicalPhraseSource, UpsertMedicalPhrasePayload } from './types';

const PAGE_SIZE = 20;

const fieldOptions = [
  { value: 'visit.exam.anamnesis', label: 'Анамнез' },
  { value: 'visit.exam.examination', label: 'Осмотр' },
  { value: 'visit.exam.symptoms', label: 'Симптомы' },
  { value: 'visit.exam.manipulations', label: 'Манипуляции' },
  { value: 'visit.exam.comment', label: 'Внутренний комментарий' },
  { value: 'visit.recommendation.treatmentPlan', label: 'План лечения' },
  { value: 'visit.recommendation.careNotes', label: 'Рекомендации владельцу' },
];

const sourceOptions: Array<{ value: MedicalPhraseSource; label: string }> = [
  { value: 'SYSTEM', label: 'Общая фраза' },
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

const phraseSchema = z
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

type PhraseFormValues = z.infer<typeof phraseSchema>;

export function MedicalPhrasesSettingsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'settings.manage');
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [filters, setFilters] = useState<{
    field?: string;
    source?: MedicalPhraseSource;
    isActive?: boolean;
    search?: string;
    species?: string;
    diagnosis?: string;
  }>({ isActive: true });
  const [editingPhrase, setEditingPhrase] = useState<MedicalPhrase | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const offset = (page - 1) * PAGE_SIZE;
  const phrasesQuery = useQuery({
    queryKey: ['medical-phrases', 'manage', filters, page],
    queryFn: () => manageMedicalPhrases({ ...filters, limit: PAGE_SIZE, offset }),
    enabled: canManage,
  });
  const { control, handleSubmit, reset, watch } = useForm<PhraseFormValues>({
    resolver: zodResolver(phraseSchema),
    defaultValues: getEmptyFormValues(),
  });
  const selectedSource = watch('source');
  const saveMutation = useMutation({
    mutationFn: (values: PhraseFormValues) =>
      editingPhrase ? updateMedicalPhrase(editingPhrase.id, toPayload(values, editingPhrase)) : createMedicalPhrase(toPayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success(editingPhrase ? 'Фраза обновлена' : 'Фраза добавлена');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const toggleMutation = useMutation({
    mutationFn: (phrase: MedicalPhrase) => updateMedicalPhrase(phrase.id, phraseToPayload(phrase, { isActive: !phrase.isActive })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('Статус фразы обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const removeMutation = useMutation({
    mutationFn: removeMedicalPhrase,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['medical-phrases'] });
      message.success('mode' in result ? 'Самообученная фраза удалена' : 'Фраза отключена');
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
        title: 'Фраза',
        dataIndex: 'title',
        key: 'title',
        width: 360,
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
        width: 180,
        render: (value: string) => getFieldLabel(value),
      },
      {
        title: 'Источник',
        dataIndex: 'source',
        key: 'source',
        width: 170,
        render: (value: MedicalPhraseSource, record) => (
          <Space direction="vertical" size={2}>
            <Tag color={getSourceColor(value)}>{getSourceLabel(value)}</Tag>
            {record.employee ? <Typography.Text type="secondary">{record.employee.fullName}</Typography.Text> : null}
          </Space>
        ),
      },
      {
        title: 'Привязка',
        key: 'scope',
        width: 220,
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
        render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? 'Активна' : 'Выключена'}</Tag>,
      },
      {
        title: 'Исп.',
        dataIndex: 'usageCount',
        key: 'usageCount',
        width: 80,
      },
      {
        title: 'Обновлена',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 150,
        render: (value: string) => new Date(value).toLocaleString('ru-RU'),
      },
      {
        title: 'Действие',
        key: 'actions',
        width: 260,
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
                <Button size="small" onClick={() => toggleMutation.mutate(record)} loading={toggleMutation.isPending}>
                  {record.isActive ? 'Отключить' : 'Включить'}
                </Button>
                {record.isActive ? (
                  <Tooltip title="Системная фраза не удаляется физически, а отключается">
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
    [toggleMutation, removeMutation],
  );

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function openCreate() {
    setEditingPhrase(null);
    reset(getEmptyFormValues());
    setModalOpen(true);
  }

  function openEdit(phrase: MedicalPhrase) {
    setEditingPhrase(phrase);
    reset({
      field: phrase.field,
      source: phrase.source,
      title: phrase.title,
      text: phrase.text,
      category: phrase.category ?? '',
      species: phrase.species ?? '',
      diagnosis: phrase.diagnosis ?? '',
      isActive: phrase.isActive,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingPhrase(null);
    reset(getEmptyFormValues());
  }

  function submitSearch() {
    setFilters((current) => ({ ...current, search: searchDraft.trim() || undefined }));
    setPage(1);
  }

  function resetFilters() {
    setSearchDraft('');
    setFilters({ isActive: true });
    setPage(1);
  }

  function confirmRemove(phrase: MedicalPhrase) {
    modal.confirm({
      title: phrase.source === 'EMPLOYEE' ? 'Удалить самообученную фразу?' : 'Отключить фразу?',
      content:
        phrase.source === 'EMPLOYEE'
          ? 'Фраза будет удалена из личных подсказок врача.'
          : 'Фраза останется в справочнике, но пропадёт из быстрых подсказок в приёме.',
      okText: phrase.source === 'EMPLOYEE' ? 'Удалить' : 'Отключить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => removeMutation.mutate(phrase.id),
    });
  }

  function confirmCleanupLearned() {
    modal.confirm({
      title: 'Очистить самообученные фразы?',
      content: filters.field
        ? `Будут удалены самообученные фразы только из раздела «${getFieldLabel(filters.field)}».`
        : 'Будут удалены все самообученные фразы врачей. Общие фразы и шаблоны диагнозов не изменятся.',
      okText: 'Очистить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => cleanupMutation.mutate({ field: filters.field }),
    });
  }

  if (!canManage) {
    return (
      <div className="page">
        <PageHeader title="Быстрые фразы" description="Этот раздел доступен только директору клиники." />
        <div className="list-panel">
          <div className="list-panel-body">
            <Typography.Text type="danger">Недостаточно прав для управления быстрыми фразами.</Typography.Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Быстрые фразы"
        description="Общие подсказки, шаблоны по диагнозам и самообученные фразы врачей."
        extra={
          <Space wrap>
            <Button danger icon={<DeleteOutlined />} loading={cleanupMutation.isPending} onClick={confirmCleanupLearned}>
              Очистить самообученные
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Добавить фразу
            </Button>
          </Space>
        }
      />

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
            <Select allowClear placeholder="Раздел" value={filters.field} options={fieldOptions} onChange={(value) => updateFilter('field', value)} />
            <Select allowClear placeholder="Источник" value={filters.source} options={sourceOptions} onChange={(value) => updateFilter('source', value)} />
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
            <Select
              allowClear
              showSearch
              placeholder="Вид"
              value={filters.species}
              options={speciesOptions}
              onChange={(value) => updateFilter('species', value)}
            />
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
          </Space>
        </div>
        <div className="list-panel-body">
          {phrasesQuery.isError ? <Typography.Text type="danger">{getErrorMessage(phrasesQuery.error)}</Typography.Text> : null}
          <Table<MedicalPhrase>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={phrasesQuery.data?.items ?? []}
            loading={phrasesQuery.isLoading}
            scroll={{ x: 1480 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: phrasesQuery.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            onRow={(record) => ({ onDoubleClick: () => openEdit(record) })}
          />
        </div>
      </div>

      <FormModal
        open={modalOpen}
        editingPhrase={editingPhrase}
        selectedSource={selectedSource}
        control={control}
        loading={saveMutation.isPending}
        onClose={closeModal}
        onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
      />
    </div>
  );
}

function FormModal({
  open,
  editingPhrase,
  selectedSource,
  control,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editingPhrase: MedicalPhrase | null;
  selectedSource: MedicalPhraseSource;
  control: ReturnType<typeof useForm<PhraseFormValues>>['control'];
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title={editingPhrase ? 'Редактировать фразу' : 'Новая быстрая фраза'}
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
                <Select {...field} options={fieldOptions} placeholder="Выберите раздел" />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="source"
            render={({ field, fieldState }) => (
              <Form.Item label="Источник" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  {...field}
                  options={editingPhrase?.source === 'EMPLOYEE' ? sourceOptions : sourceOptions.filter((option) => option.value !== 'EMPLOYEE')}
                  disabled={editingPhrase?.source === 'EMPLOYEE'}
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
            <Form.Item label="Текст фразы" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea {...field} rows={8} placeholder="Текст, который будет вставляться врачу в лист приёма" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Form.Item label="Показывать в быстрых подсказках">
              <Switch checked={field.value} onChange={field.onChange} />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function getEmptyFormValues(): PhraseFormValues {
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

function toPayload(values: PhraseFormValues, editingPhrase?: MedicalPhrase | null): UpsertMedicalPhrasePayload {
  return {
    field: values.field,
    title: values.title,
    text: values.text,
    category: values.category || null,
    species: values.species || null,
    diagnosis: values.diagnosis || null,
    source: values.source === 'EMPLOYEE' ? (editingPhrase?.source === 'EMPLOYEE' ? undefined : 'SYSTEM') : values.source,
    isActive: values.isActive,
  };
}

function phraseToPayload(phrase: MedicalPhrase, override: Partial<PhraseFormValues>): UpsertMedicalPhrasePayload {
  return toPayload(
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

function getFieldLabel(value: string) {
  return fieldOptions.find((option) => option.value === value)?.label ?? value;
}

function getSourceLabel(value: MedicalPhraseSource) {
  return sourceOptions.find((option) => option.value === value)?.label ?? value;
}

function getSourceColor(value: MedicalPhraseSource) {
  if (value === 'EMPLOYEE') {
    return 'purple';
  }

  if (value === 'DIAGNOSIS_TEMPLATE') {
    return 'blue';
  }

  return 'green';
}
