import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AutoComplete, Button, Drawer, Form, Input, Popconfirm, Space, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { Visit, VisitDiagnosis, VisitDiagnosisInput } from './types';
import { createVisitDiagnosis, deleteVisitDiagnosis, updateVisitDiagnosis } from './visits.api';

const diagnosisSchema = z.object({
  title: z.string().trim().min(2, 'Введите диагноз').max(500),
  diagnosisType: optionalString(120),
  description: optionalString(2000),
  status: optionalString(120),
});

type DiagnosisValues = z.infer<typeof diagnosisSchema>;
type DiagnosisFormInput = z.input<typeof diagnosisSchema>;

type VisitDiagnosesTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
  compact?: boolean;
  showLockedAlert?: boolean;
};

export function VisitDiagnosesTab({ visit, canManage, locked, compact = false, showLockedAlert = true }: VisitDiagnosesTabProps) {
  const queryClient = useQueryClient();
  const [editingDiagnosis, setEditingDiagnosis] = useState<VisitDiagnosis | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const disabled = locked || !canManage;
  const saveMutation = useMutation({
    mutationFn: (values: VisitDiagnosisInput) =>
      editingDiagnosis ? updateVisitDiagnosis(visit.id, editingDiagnosis.id, values) : createVisitDiagnosis(visit.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      setDrawerOpen(false);
      setEditingDiagnosis(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (diagnosisId: string) => deleteVisitDiagnosis(visit.id, diagnosisId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visits', visit.id] });
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  const columns = useMemo<ColumnsType<VisitDiagnosis>>(
    () => [
      { title: 'Диагноз', dataIndex: 'title', key: 'title' },
      { title: 'Тип', dataIndex: 'diagnosisType', key: 'diagnosisType', render: (value: string | null) => value || '—' },
      { title: 'Статус', dataIndex: 'status', key: 'status', render: (value: string | null) => value || '—' },
      {
        title: 'Описание',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        responsive: compact ? ['lg'] : undefined,
        render: (value: string | null) => value || '—',
      },
      {
        title: '',
        key: 'actions',
        width: compact ? 112 : 150,
        render: (_, record) =>
          disabled ? null : (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingDiagnosis(record);
                  setDrawerOpen(true);
                }}
              />
              <Popconfirm title="Удалить диагноз?" okText="Удалить" cancelText="Отмена" onConfirm={() => deleteMutation.mutate(record.id)}>
                <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
              </Popconfirm>
            </Space>
          ),
      },
    ],
    [compact, deleteMutation, disabled],
  );

  return (
    <Space direction="vertical" size={compact ? 10 : 16} className={`full-width${compact ? ' visit-diagnoses-inline' : ''}`}>
      {locked && showLockedAlert ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." /> : null}
      {saveMutation.isError ? <Typography.Text type="danger">{getErrorMessage(saveMutation.error)}</Typography.Text> : null}
      {deleteMutation.isError ? <Typography.Text type="danger">{getErrorMessage(deleteMutation.error)}</Typography.Text> : null}
      <div className="toolbar-row">
        <Typography.Text strong={compact} type={compact ? undefined : 'secondary'}>
          {compact ? 'Диагноз' : 'Диагнозы приёма'}
        </Typography.Text>
        {!disabled ? (
          <Button
            type="primary"
            size={compact ? 'small' : 'middle'}
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDiagnosis(null);
              setDrawerOpen(true);
            }}
          >
            Добавить диагноз
          </Button>
        ) : null}
      </div>
      <Table<VisitDiagnosis>
        rowKey="id"
        columns={columns}
        dataSource={visit.diagnoses}
        pagination={false}
        size={compact ? 'small' : 'middle'}
        className="dense-table"
      />
      <DiagnosisDrawer
        open={drawerOpen}
        visit={visit}
        diagnosis={editingDiagnosis}
        isSubmitting={saveMutation.isPending}
        submitError={saveMutation.error}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </Space>
  );
}

function DiagnosisDrawer({
  open,
  visit,
  diagnosis,
  isSubmitting,
  submitError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  visit: Visit;
  diagnosis: VisitDiagnosis | null;
  isSubmitting?: boolean;
  submitError?: unknown;
  onClose: () => void;
  onSubmit: (values: VisitDiagnosisInput) => void;
}) {
  const { control, handleSubmit, reset } = useForm<DiagnosisFormInput, unknown, DiagnosisValues>({
    resolver: zodResolver(diagnosisSchema),
    defaultValues: getDefaultValues(diagnosis),
  });
  const diagnosisOptions = getDiagnosisOptions(visit.animal?.species);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(diagnosis));
    }
  }

  return (
    <Drawer
      title={diagnosis ? 'Редактировать диагноз' : 'Добавить диагноз'}
      width={560}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <Form.Item label="Диагноз" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <AutoComplete
                value={field.value}
                options={diagnosisOptions.map((value) => ({ value }))}
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                onChange={field.onChange}
              >
                <Input autoFocus placeholder="Начните вводить диагноз" />
              </AutoComplete>
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="diagnosisType"
            render={({ field, fieldState }) => (
              <Form.Item label="Тип" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <AutoComplete
                  value={field.value}
                  options={diagnosisTypeOptions.map((value) => ({ value }))}
                  filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  onChange={field.onChange}
                >
                  <Input placeholder="Предварительный, основной..." />
                </AutoComplete>
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label="Статус" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <AutoComplete
                  value={field.value}
                  options={diagnosisStatusOptions.map((value) => ({ value }))}
                  filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  onChange={field.onChange}
                >
                  <Input placeholder="Активен, под вопросом..." />
                </AutoComplete>
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <Form.Item label="Описание" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={5} {...field} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

const diagnosisTypeOptions = [
  'Предварительный',
  'Основной',
  'Сопутствующий',
  'Дифференциальный',
  'Заключительный',
  'Послеоперационный',
  'Хронический',
  'Осложнение',
];

const diagnosisStatusOptions = [
  'Активен',
  'Под вопросом',
  'Подтверждён',
  'Исключён',
  'Хронический',
  'В ремиссии',
  'Требует наблюдения',
  'Решён',
];

const commonDiagnoses = [
  'Гастроэнтерит',
  'Острый гастрит',
  'Энтероколит',
  'Панкреатит',
  'Хроническая болезнь почек',
  'Цистит',
  'Мочекаменная болезнь',
  'Отит наружный',
  'Дерматит',
  'Атопический дерматит',
  'Пищевая аллергия',
  'Блошиный аллергический дерматит',
  'Абсцесс',
  'Рана мягких тканей',
  'Конъюнктивит',
  'Кератит',
  'Стоматит',
  'Гингивит',
  'Пародонтит',
  'Хромота неясной этиологии',
  'Ушиб мягких тканей',
  'Ожирение',
  'Истощение',
  'Пироплазмоз',
  'Гельминтоз',
  'Отравление',
];

const catDiagnoses = [
  'Вирусный ринотрахеит кошек',
  'Калицивироз кошек',
  'Панлейкопения кошек',
  'Хронический гингивостоматит кошек',
  'Идиопатический цистит кошек',
  'Уретральная обструкция',
  'Триадит кошек',
  'Гипертиреоз кошек',
  'Сахарный диабет кошек',
  'Липидоз печени кошек',
  'Комплекс эозинофильной гранулёмы',
  'Дерматофития кошек',
];

const dogDiagnoses = [
  'Парвовирусный энтерит собак',
  'Инфекционный трахеобронхит собак',
  'Чума плотоядных',
  'Лептоспироз',
  'Пироплазмоз собак',
  'Дисплазия тазобедренного сустава',
  'Разрыв передней крестовидной связки',
  'Пиометра',
  'Отодектоз',
  'Демодекоз',
  'Себорея',
  'Коллапс трахеи',
  'Эндокардиоз митрального клапана',
];

function getDiagnosisOptions(species?: string | null) {
  const normalized = species?.toLowerCase() ?? '';
  const specific = normalized.includes('кош') ? catDiagnoses : normalized.includes('соб') ? dogDiagnoses : [];

  return [...specific, ...commonDiagnoses].filter((value, index, values) => values.indexOf(value) === index);
}

function getDefaultValues(diagnosis: VisitDiagnosis | null): DiagnosisFormInput {
  return {
    title: diagnosis?.title ?? '',
    diagnosisType: nullToEmpty(diagnosis?.diagnosisType),
    description: nullToEmpty(diagnosis?.description),
    status: nullToEmpty(diagnosis?.status),
  };
}
