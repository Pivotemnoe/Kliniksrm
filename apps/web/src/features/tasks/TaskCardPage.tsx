import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import {
  archiveTask,
  cancelTask,
  completeTask,
  getTask,
  reopenTask,
  updateTask,
} from './tasks.api';
import { TaskFormDrawer } from './TaskFormDrawer';
import {
  getTaskTypeLabel,
  Task,
  TaskMutationInput,
  TaskStatus,
  taskStatusColors,
  taskStatusLabels,
} from './types';

export function TaskCardPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'tasks.manage');
  const [editOpen, setEditOpen] = useState(false);
  const taskQuery = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
  });
  const updateMutation = useMutation({
    mutationFn: (values: TaskMutationInput) => updateTask(taskId, values),
    onSuccess: async () => {
      await invalidateTask(queryClient, taskId);
      setEditOpen(false);
      message.success('Задача сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'done' | 'cancel' | 'reopen' | 'archive') => {
      if (action === 'done') {
        return completeTask(taskId);
      }
      if (action === 'cancel') {
        return cancelTask(taskId);
      }
      if (action === 'archive') {
        return archiveTask(taskId);
      }
      return reopenTask(taskId);
    },
    onSuccess: async () => {
      await invalidateTask(queryClient, taskId);
      message.success('Статус задачи обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const task = taskQuery.data;

  function submitTask(values: TaskMutationInput) {
    updateMutation.mutate(values);
  }

  return (
    <div className="page">
      <PageHeader
        title={task?.title ?? 'Задача'}
        description="Карточка задачи с владельцем, пациентом, исполнителем и статусом."
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>
              К списку
            </Button>
            {canManage && task ? (
              <>
                <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Изменить
                </Button>
                {task.status === 'OPEN' ? (
                  <>
                    <Button
                      icon={<CheckOutlined />}
                      loading={actionMutation.isPending}
                      onClick={() => actionMutation.mutate('done')}
                    >
                      Выполнить
                    </Button>
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      loading={actionMutation.isPending}
                      onClick={() => actionMutation.mutate('cancel')}
                    >
                      Отменить
                    </Button>
                  </>
                ) : (
                  <Button
                    icon={<UndoOutlined />}
                    loading={actionMutation.isPending}
                    onClick={() => actionMutation.mutate('reopen')}
                  >
                    Вернуть
                  </Button>
                )}
                {task.status !== 'ARCHIVED' ? (
                  <Button loading={actionMutation.isPending} onClick={() => actionMutation.mutate('archive')}>
                    В архив
                  </Button>
                ) : null}
              </>
            ) : null}
          </Space>
        }
      />
      {taskQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(taskQuery.error)} className="form-alert" /> : null}
      <Space direction="vertical" size={16} className="full-width">
        <div className="list-panel">
          <div className="list-panel-header">
            <Space direction="vertical" size={2}>
              <Typography.Title level={4} className="compact-title">Основное</Typography.Title>
              <Typography.Text type="secondary">Напоминание, назначение и связь с карточками CRM.</Typography.Text>
            </Space>
            {task ? <TaskStatusTag status={task.status} /> : null}
          </div>
          <div className="list-panel-body">
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Тип">{getTaskTypeLabel(task?.taskType)}</Descriptions.Item>
              <Descriptions.Item label="Срок">{formatDateTime(task?.dueAt)}</Descriptions.Item>
              <Descriptions.Item label="Владелец">
                {task?.owner ? (
                  <Typography.Link onClick={() => navigate(`/owners/${task.owner?.id}`)}>{task.owner.fullName}</Typography.Link>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">{task?.owner?.phone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Пациент">
                {task?.animal ? (
                  <Space size={6}>
                    <AnimalSpeciesLabel species={task.animal.species} fallback="Вид не указан" />
                    <Typography.Link onClick={() => navigate(`/patients/${task.animal?.id}`)}>{task.animal.nickname}</Typography.Link>
                    {task.animal.breed ? <Typography.Text type="secondary">{task.animal.breed}</Typography.Text> : null}
                  </Space>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Исполнитель">{getAssigneeLabel(task)}</Descriptions.Item>
              <Descriptions.Item label="Создал">{getEmployeeLabel(task?.creator)}</Descriptions.Item>
              <Descriptions.Item label="Создана">{formatDateTime(task?.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Обновлена">{formatDateTime(task?.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="Комментарий" span={2}>
                {task?.comment ? <Typography.Paragraph>{task.comment}</Typography.Paragraph> : '—'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      </Space>
      <TaskFormDrawer
        open={editOpen}
        title="Редактировать задачу"
        initialTask={task}
        onClose={() => setEditOpen(false)}
        onSubmit={submitTask}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
    </div>
  );
}

function TaskStatusTag({ status }: { status: TaskStatus }) {
  return <Tag color={taskStatusColors[status]}>{taskStatusLabels[status]}</Tag>;
}

function getAssigneeLabel(task?: Task) {
  if (task?.assignee) {
    return getEmployeeLabel(task.assignee);
  }

  if (task?.assigneeRole) {
    return task.assigneeRole.title;
  }

  return '—';
}

function getEmployeeLabel(employee?: { fullName: string; position?: string | null } | null) {
  if (!employee) {
    return '—';
  }

  return employee.position ? `${employee.fullName}, ${employee.position}` : employee.fullName;
}

async function invalidateTask(queryClient: ReturnType<typeof useQueryClient>, taskId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tasks', taskId] }),
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  ]);
}
