import { CheckOutlined, CloseOutlined, EditOutlined, PlusOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime, getDayBounds } from '../../shared/utils/date';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { listRoles } from '../employees/employees.api';
import { archiveTask, cancelTask, completeTask, createTask, listTasks, reopenTask, updateTask } from './tasks.api';
import { TaskFormDrawer } from './TaskFormDrawer';
import { CreateTaskInput, getTaskTypeLabel, Task, TaskMutationInput, TaskStatus, taskStatusColors, taskStatusLabels } from './types';

const pageSize = 10;
type DuePreset = 'all' | 'overdue' | 'today' | 'tomorrow';

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'tasks.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | undefined>('OPEN');
  const [dueDate, setDueDate] = useState('');
  const [duePreset, setDuePreset] = useState<DuePreset>('today');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [assigneeRoleCode, setAssigneeRoleCode] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const dueBounds = getTaskDueBounds(duePreset, dueDate);
  const tasksQuery = useQuery({
    queryKey: ['tasks', { search, status, dueDate, duePreset, assigneeId, assigneeRoleCode, limit: pageSize, offset }],
    queryFn: () => listTasks({ search, status, assigneeId, assigneeRoleCode, ...dueBounds, limit: pageSize, offset }),
  });
  const resourcesQuery = useQuery({ queryKey: ['scheduling', 'resources'], queryFn: getSchedulingResources });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });

  const createMutation = useMutation({
    mutationFn: (values: CreateTaskInput) => createTask(values),
    onSuccess: async () => {
      await invalidateTasks(queryClient);
      setCreateOpen(false);
      message.success('Задача создана');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ taskId, values }: { taskId: string; values: TaskMutationInput }) => updateTask(taskId, values),
    onSuccess: async () => {
      await invalidateTasks(queryClient);
      setEditingTask(null);
      message.success('Задача сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: ({ task, action }: { task: Task; action: 'done' | 'cancel' | 'reopen' | 'archive' }) => {
      if (action === 'done') {
        return completeTask(task.id);
      }
      if (action === 'cancel') {
        return cancelTask(task.id);
      }
      if (action === 'archive') {
        return archiveTask(task.id);
      }
      return reopenTask(task.id);
    },
    onSuccess: async () => {
      await invalidateTasks(queryClient);
      message.success('Статус задачи обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<Task>>(
    () => [
      {
        title: 'Срок',
        dataIndex: 'dueAt',
        key: 'dueAt',
        width: 170,
        render: (value: string | null, record) => (
          <Space direction="vertical" size={2}>
            <span>{formatDateTime(value)}</span>
            <DueTag dueAt={value} status={record.status} />
          </Space>
        ),
      },
      {
        title: 'Задача',
        dataIndex: 'title',
        key: 'title',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/tasks/${record.id}`)}>
            {value}
          </Button>
        ),
      },
      {
        title: 'Тип',
        dataIndex: 'taskType',
        key: 'taskType',
        render: (value: string | null) => getTaskTypeLabel(value),
      },
      { title: 'Владелец', key: 'owner', render: (_, record) => record.owner?.fullName ?? '—' },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, record) =>
          record.animal ? (
            <Space size={6}>
              <AnimalSpeciesLabel species={record.animal.species} fallback="Вид не указан" />
              <Typography.Text>{record.animal.nickname}</Typography.Text>
            </Space>
          ) : (
            '—'
          ),
      },
      {
        title: 'Исполнитель',
        key: 'assignee',
        render: (_, record) => getAssigneeLabel(record),
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
        width: 260,
        render: (_, record) =>
          canManage ? (
            <Space wrap>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditingTask(record)}>
                Изменить
              </Button>
              {record.status === 'OPEN' ? (
                <>
                  <Button size="small" icon={<CheckOutlined />} onClick={() => actionMutation.mutate({ task: record, action: 'done' })}>
                    Выполнить
                  </Button>
                  <Button size="small" icon={<CloseOutlined />} onClick={() => actionMutation.mutate({ task: record, action: 'cancel' })}>
                    Отменить
                  </Button>
                </>
              ) : (
                <Button size="small" icon={<UndoOutlined />} onClick={() => actionMutation.mutate({ task: record, action: 'reopen' })}>
                  Вернуть
                </Button>
              )}
              {record.status !== 'ARCHIVED' ? (
                <Button size="small" onClick={() => actionMutation.mutate({ task: record, action: 'archive' })}>
                  В архив
                </Button>
              ) : null}
            </Space>
          ) : null,
      },
    ],
    [actionMutation, canManage, navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  function closeForm() {
    setCreateOpen(false);
    setEditingTask(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function submitTask(values: TaskMutationInput) {
    if (editingTask) {
      updateMutation.mutate({ taskId: editingTask.id, values });
      return;
    }

    if (!values.title) {
      return;
    }

    createMutation.mutate(values as CreateTaskInput);
  }

  return (
    <div className="page">
      <PageHeader
        title="Календарь задач"
        description="Задачи по пациентам, сотрудникам, ролям и напоминаниям."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Создать задачу
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по задаче, клиенту, пациенту или комментарию"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
              setOffset(0);
            }}
          />
          <Segmented<DuePreset>
            value={duePreset}
            onChange={(value) => {
              setDuePreset(value);
              setDueDate('');
              setOffset(0);
            }}
            options={[
              { value: 'today', label: 'Сегодня' },
              { value: 'tomorrow', label: 'Завтра' },
              { value: 'overdue', label: 'Просрочено' },
              { value: 'all', label: 'Все' },
            ]}
          />
          <Space wrap>
            <Input
              type="date"
              className="date-filter"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setDuePreset('all');
                setOffset(0);
              }}
            />
            <Select
              allowClear
              placeholder="Статус"
              className="status-filter"
              value={status}
              onChange={(value) => {
                setStatus(value);
                setOffset(0);
              }}
              options={Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              placeholder="Сотрудник"
              className="status-filter"
              value={assigneeId}
              loading={resourcesQuery.isLoading}
              onChange={(value) => {
                setAssigneeId(value);
                if (value) {
                  setAssigneeRoleCode(undefined);
                }
                setOffset(0);
              }}
              options={resourcesQuery.data?.employees.map((employee) => ({ value: employee.id, label: employee.fullName }))}
            />
            <Select
              allowClear
              placeholder="Роль"
              className="status-filter"
              value={assigneeRoleCode}
              loading={rolesQuery.isLoading}
              onChange={(value) => {
                setAssigneeRoleCode(value);
                if (value) {
                  setAssigneeId(undefined);
                }
                setOffset(0);
              }}
              options={rolesQuery.data?.map((role) => ({ value: role.code, label: role.title }))}
            />
          </Space>
        </div>
        <div className="list-panel-body">
          <Space direction="vertical" size={16} className="full-width">
            {tasksQuery.isError ? <Typography.Text type="danger">{getErrorMessage(tasksQuery.error)}</Typography.Text> : null}
            <Table<Task>
              rowKey="id"
              columns={columns}
              dataSource={tasksQuery.data?.items ?? []}
              loading={tasksQuery.isLoading}
              onRow={(record) => ({ onDoubleClick: () => navigate(`/tasks/${record.id}`) })}
              pagination={{
                current: offset / pageSize + 1,
                pageSize,
                total: tasksQuery.data?.total ?? 0,
                showSizeChanger: false,
              }}
              onChange={handleTableChange}
              className="dense-table"
            />
          </Space>
        </div>
      </div>
      <TaskFormDrawer
        open={createOpen || Boolean(editingTask)}
        title={editingTask ? 'Редактировать задачу' : 'Новая задача'}
        initialTask={editingTask}
        onClose={closeForm}
        onSubmit={submitTask}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        submitError={editingTask ? updateMutation.error : createMutation.error}
      />
    </div>
  );
}

function getAssigneeLabel(task: Task) {
  if (task.assignee) {
    return task.assignee.position ? `${task.assignee.fullName}, ${task.assignee.position}` : task.assignee.fullName;
  }

  if (task.assigneeRole) {
    return task.assigneeRole.title;
  }

  return '—';
}

function getTaskDayBounds(date: string) {
  const bounds = getDayBounds(date);

  return {
    dueFrom: bounds.dateFrom,
    dueTo: bounds.dateTo,
  };
}

function getTaskDueBounds(preset: DuePreset, dueDate: string) {
  if (dueDate) {
    return getTaskDayBounds(dueDate);
  }

  if (preset === 'today') {
    return getTaskDayBounds(toDateInput(new Date()));
  }

  if (preset === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getTaskDayBounds(toDateInput(tomorrow));
  }

  if (preset === 'overdue') {
    return { dueTo: new Date().toISOString() };
  }

  return {};
}

function DueTag({ dueAt, status }: { dueAt: string | null; status: TaskStatus }) {
  if (!dueAt || status !== 'OPEN') {
    return null;
  }

  const dueDate = new Date(dueAt);
  const today = toDateInput(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toDateInput(tomorrowDate);
  const dueDay = toDateInput(dueDate);

  if (dueDate.getTime() < Date.now()) {
    return <Tag color="red">просрочено</Tag>;
  }

  if (dueDay === today) {
    return <Tag color="gold">сегодня</Tag>;
  }

  if (dueDay === tomorrow) {
    return <Tag color="blue">завтра</Tag>;
  }

  return null;
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['tasks'] });
}
