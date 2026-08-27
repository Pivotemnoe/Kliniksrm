import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { taskStatusColors, taskStatusLabels, TaskStatus } from '../tasks/types';
import { createVaccination, deleteVaccination, listVaccinations, updateVaccination } from './animals.api';
import { Vaccination, VaccinationMutationInput } from './types';
import { VaccinationFormDrawer } from './VaccinationFormDrawer';

type AnimalVaccinationsTabProps = {
  animalId: string;
  visitId?: string;
  readOnly?: boolean;
  autoOpen?: boolean;
  onCreated?: () => void;
};

export function AnimalVaccinationsTab({ animalId, visitId, readOnly = false, autoOpen = false, onCreated }: AnimalVaccinationsTabProps) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null);
  const [deletingVaccination, setDeletingVaccination] = useState<Vaccination | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  useEffect(() => {
    if (autoOpen && !readOnly) setCreateOpen(true);
  }, [autoOpen, readOnly]);
  const vaccinationsQuery = useQuery({
    queryKey: ['animals', animalId, 'vaccinations'],
    queryFn: () => listVaccinations(animalId),
  });
  const createMutation = useMutation({
    mutationFn: (values: VaccinationMutationInput) => createVaccination(animalId, values),
    onSuccess: async () => {
      await invalidate();
      setCreateOpen(false);
      onCreated?.();
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
  const deleteMutation = useMutation({
    mutationFn: () => deleteVaccination(animalId, deletingVaccination!.id, deleteReason.trim()),
    onSuccess: async () => {
      await invalidate();
      setDeletingVaccination(null);
      setDeleteReason('');
      message.success('Ошибочная вакцинация удалена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function invalidate() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals', animalId, 'vaccinations'] }),
        ...(visitId ? [queryClient.invalidateQueries({ queryKey: ['visits', visitId] })] : []),
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
      ...(!readOnly ? [{
        title: '',
        key: 'actions',
        width: 112,
        render: (_, record) => (
          <Space size={4}>
            <Button icon={<EditOutlined />} onClick={() => setEditingVaccination(record)} aria-label="Редактировать вакцинацию" />
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeleteReason('');
                setDeletingVaccination(record);
              }}
              aria-label="Удалить ошибочную вакцинацию"
            />
          </Space>
        ),
      }] as ColumnsType<Vaccination> : []),
    ],
    [readOnly],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">История вакцинаций</Typography.Text>
        {!readOnly ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Добавить вакцинацию
          </Button>
        ) : null}
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
      {!readOnly ? <VaccinationFormDrawer
        open={createOpen}
        title="Добавить вакцинацию"
        visitId={visitId}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      /> : null}
      {!readOnly ? <VaccinationFormDrawer
        open={Boolean(editingVaccination)}
        title="Редактировать вакцинацию"
        initialVaccination={editingVaccination}
        onClose={() => setEditingVaccination(null)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      /> : null}
      <Modal
        open={Boolean(deletingVaccination)}
        title="Удалить ошибочную вакцинацию?"
        okText="Удалить"
        okButtonProps={{ danger: true, disabled: deleteReason.trim().length < 2 }}
        cancelText="Отмена"
        confirmLoading={deleteMutation.isPending}
        onCancel={() => {
          setDeletingVaccination(null);
          setDeleteReason('');
        }}
        onOk={() => deleteMutation.mutate()}
      >
        <Typography.Paragraph>
          Запись исчезнет из активной истории. Неоплаченные связанные позиции приёма будут удалены, действие останется в аудите.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder="Причина удаления"
        />
      </Modal>
    </Space>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}
