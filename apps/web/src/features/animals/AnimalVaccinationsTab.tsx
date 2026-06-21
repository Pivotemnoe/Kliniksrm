import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { taskStatusColors, taskStatusLabels, TaskStatus } from '../tasks/types';
import { createVaccination, listVaccinations, updateVaccination } from './animals.api';
import { Vaccination, VaccinationMutationInput } from './types';
import { VaccinationFormDrawer } from './VaccinationFormDrawer';

type AnimalVaccinationsTabProps = {
  animalId: string;
};

export function AnimalVaccinationsTab({ animalId }: AnimalVaccinationsTabProps) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null);
  const vaccinationsQuery = useQuery({
    queryKey: ['animals', animalId, 'vaccinations'],
    queryFn: () => listVaccinations(animalId),
  });
  const createMutation = useMutation({
    mutationFn: (values: VaccinationMutationInput) => createVaccination(animalId, values),
    onSuccess: async () => {
      await invalidate();
      setCreateOpen(false);
      message.success('Вакцинация добавлена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: (values: VaccinationMutationInput) => updateVaccination(animalId, editingVaccination!.id, values),
    onSuccess: async () => {
      await invalidate();
      setEditingVaccination(null);
      message.success('Вакцинация сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function invalidate() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals', animalId, 'vaccinations'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ]);
    }

  const columns = useMemo<ColumnsType<Vaccination>>(
    () => [
      { title: 'Вакцина', dataIndex: 'title', key: 'title' },
      { title: 'Дата вакцинации', dataIndex: 'vaccinatedAt', key: 'vaccinatedAt', render: (value: string | null) => formatDate(value) },
      { title: 'Дата ревакцинации', dataIndex: 'expiresAt', key: 'expiresAt', render: (value: string | null) => formatDate(value) },
      { title: 'Статус', dataIndex: 'status', key: 'status', render: (value: string | null) => value || '—' },
      {
        title: 'Номер / серия',
        key: 'batch',
        render: (_, record) => [record.vaccineBatch, record.vaccineSeries].filter(Boolean).join(' / ') || '—',
      },
      {
        title: 'Задача',
        key: 'task',
        render: (_, record) => {
          const task = record.revaccinationTask;

          if (!task) {
            return '—';
          }

          const status = task.status as TaskStatus;

          return <Tag color={taskStatusColors[status]}>{taskStatusLabels[status] ?? task.status}</Tag>;
        },
      },
      { title: 'Примечание', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (value: string | null) => value || '—' },
      {
        title: '',
        key: 'actions',
        width: 80,
        render: (_, record) => (
          <Button icon={<EditOutlined />} onClick={() => setEditingVaccination(record)} aria-label="Редактировать вакцинацию" />
        ),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">История вакцинаций</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Добавить вакцинацию
        </Button>
      </div>
      {vaccinationsQuery.isError ? (
        <Typography.Text type="danger">{getErrorMessage(vaccinationsQuery.error)}</Typography.Text>
      ) : null}
      <Table<Vaccination>
        rowKey="id"
        columns={columns}
        dataSource={vaccinationsQuery.data ?? []}
        loading={vaccinationsQuery.isLoading}
        pagination={false}
      />
      <VaccinationFormDrawer
        open={createOpen}
        title="Добавить вакцинацию"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
      <VaccinationFormDrawer
        open={Boolean(editingVaccination)}
        title="Редактировать вакцинацию"
        initialVaccination={editingVaccination}
        onClose={() => setEditingVaccination(null)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
    </Space>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}
