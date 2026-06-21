import { CheckOutlined, CloseOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { formatDateTime } from '../../shared/utils/date';
import { cancelTask, completeTask, createTask, listTasks, reopenTask, updateTask } from '../tasks/tasks.api';
import { TaskFormDrawer } from '../tasks/TaskFormDrawer';
import { CreateTaskInput, getTaskTypeLabel, Task, TaskMutationInput, TaskStatus, taskStatusColors, taskStatusLabels } from '../tasks/types';

type AnimalTasksTabProps = {
  ownerId: string;
  animalId: string;
};

export function AnimalTasksTab({ ownerId, animalId }: AnimalTasksTabProps) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'tasks.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const tasksQuery = useQuery({
    queryKey: ['tasks', { animalId, limit: 50, offset: 0 }],
    queryFn: () => listTasks({ animalId, limit: 50, offset: 0 }),
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateTaskInput) => createTask(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setCreateOpen(false);
      message.success('Задача создана');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ task, values }: { task: Task; values: TaskMutationInput }) => updateTask(task.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTask(null);
      message.success('Задача сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const completeMutation = useMutation({
    mutationFn: (task: Task) => completeTask(task.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      message.success('Задача выполнена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const statusMutation = useMutation({
    mutationFn: ({ task, action }: { task: Task; action: 'cancel' | 'reopen' }) => {
      if (action === 'cancel') {
        return cancelTask(task.id);
      }

      return reopenTask(task.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      message.success('Статус задачи обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<Task>>(
    () => [
      { title: 'Срок', dataIndex: 'dueAt', key: 'dueAt', render: (value: string | null) => formatDateTime(value) },
      { title: 'Задача', dataIndex: 'title', key: 'title' },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true, render: (value: string | null) => value || '—' },
      { title: 'Тип', dataIndex: 'taskType', key: 'taskType', render: (value: string | null) => getTaskTypeLabel(value) },
      {
        title: 'Исполнитель',
        key: 'assignee',
        render: (_, record) => record.assignee?.fullName ?? record.assigneeRole?.title ?? '—',
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: TaskStatus) => <Tag color={taskStatusColors[value]}>{taskStatusLabels[value]}</Tag>,
      },
      {
        title: 'Действия',
        key: 'actions',
        render: (_, record) =>
          canManage ? (
            <Space wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditingTask(record)}>
                Изменить
              </Button>
              {record.status === 'OPEN' ? (
                <>
                  <Button size="small" icon={<CheckOutlined />} onClick={() => completeMutation.mutate(record)}>
                    Выполнить
                  </Button>
                  <Button size="small" icon={<CloseOutlined />} onClick={() => statusMutation.mutate({ task: record, action: 'cancel' })}>
                    Отменить
                  </Button>
                </>
              ) : (
                <Button size="small" icon={<UndoOutlined />} onClick={() => statusMutation.mutate({ task: record, action: 'reopen' })}>
                  Вернуть
                </Button>
              )}
            </Space>
          ) : null,
      },
    ],
    [canManage, completeMutation, statusMutation],
  );

  function submit(values: TaskMutationInput) {
    if (editingTask) {
      updateMutation.mutate({ task: editingTask, values });
      return;
    }

    if (!values.title) {
      return;
    }

    createMutation.mutate({
      ...values,
      ownerId,
      animalId,
      title: values.title,
    });
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Space className="toolbar-row">
        <Typography.Text type="secondary">Задачи и напоминания по пациенту.</Typography.Text>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Создать задачу
          </Button>
        ) : null}
      </Space>
      {tasksQuery.isError ? <Typography.Text type="danger">{getErrorMessage(tasksQuery.error)}</Typography.Text> : null}
      <Table<Task>
        rowKey="id"
        columns={columns}
        dataSource={tasksQuery.data?.items ?? []}
        loading={tasksQuery.isLoading}
        pagination={false}
        className="dense-table"
      />
      <TaskFormDrawer
        open={createOpen || Boolean(editingTask)}
        title={editingTask ? 'Редактировать задачу пациента' : 'Создать задачу пациенту'}
        initialTask={editingTask}
        initialOwnerId={ownerId}
        initialAnimalId={animalId}
        onClose={() => {
          setCreateOpen(false);
          setEditingTask(null);
          createMutation.reset();
          updateMutation.reset();
        }}
        onSubmit={submit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        submitError={editingTask ? updateMutation.error : createMutation.error}
      />
    </Space>
  );
}
