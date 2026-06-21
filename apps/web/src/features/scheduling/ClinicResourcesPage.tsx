import { EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  createHospitalBox,
  createRoom,
  createWarehouse,
  getSchedulingSettings,
  updateClinicOffice,
  updateHospitalBox,
  updateRoom,
  updateWarehouse,
} from './scheduling.api';
import {
  ClinicOfficeSettings,
  OfficeWorkingDay,
  OfficeWorkingHours,
  SchedulingHospitalBox,
  SchedulingResourcePayload,
  SchedulingRoom,
  SchedulingWarehouse,
} from './types';

const officeSchema = z.object({
  name: z.string().trim().min(2, 'Укажите название').max(160),
  phone: z.string().trim().max(40, 'Слишком длинный телефон').optional(),
  timezone: z.string().trim().min(2, 'Укажите часовой пояс').max(80),
  address: z.string().trim().max(500, 'Слишком длинный адрес').optional(),
});

const resourceSchema = z.object({
  officeId: z.string().trim().min(1, 'Выберите филиал'),
  name: z.string().trim().min(2, 'Укажите название').max(160),
});

type OfficeFormValues = z.infer<typeof officeSchema>;
type ResourceFormValues = z.infer<typeof resourceSchema>;
type ResourceItem = SchedulingRoom | SchedulingHospitalBox | SchedulingWarehouse;
type ResourceKind = 'rooms' | 'hospitalBoxes' | 'warehouses';

const tabRoutes: Record<string, string> = {
  profile: '/settings/office/profile',
  schedule: '/settings/office/schedule',
  rooms: '/settings/office/rooms',
  hospital: '/settings/office/hospital',
  warehouses: '/settings/office/warehouses',
};

const weekDays = [
  { key: 'monday', title: 'Понедельник', shortTitle: 'Пн' },
  { key: 'tuesday', title: 'Вторник', shortTitle: 'Вт' },
  { key: 'wednesday', title: 'Среда', shortTitle: 'Ср' },
  { key: 'thursday', title: 'Четверг', shortTitle: 'Чт' },
  { key: 'friday', title: 'Пятница', shortTitle: 'Пт' },
  { key: 'saturday', title: 'Суббота', shortTitle: 'Сб' },
  { key: 'sunday', title: 'Воскресенье', shortTitle: 'Вс' },
] as const;

type WeekDayKey = (typeof weekDays)[number]['key'];
type OfficeScheduleRow = OfficeWorkingDay & {
  key: WeekDayKey;
  title: string;
  shortTitle: string;
};

export function ClinicResourcesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'settings.manage');
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>();
  const settingsQuery = useQuery({ queryKey: ['scheduling', 'settings'], queryFn: getSchedulingSettings });
  const offices = settingsQuery.data?.offices ?? [];
  const selectedOffice = offices.find((office) => office.id === selectedOfficeId) ?? offices[0];
  const activeTab = getActiveTab(location.pathname);

  const { control, handleSubmit, reset } = useForm<OfficeFormValues>({
    resolver: zodResolver(officeSchema),
    defaultValues: { name: '', phone: '', timezone: 'Europe/Moscow', address: '' },
  });

  useEffect(() => {
    if (!selectedOfficeId && offices[0]) {
      setSelectedOfficeId(offices[0].id);
    }
  }, [offices, selectedOfficeId]);

  useEffect(() => {
    if (!selectedOffice) {
      return;
    }

    reset({
      name: selectedOffice.name,
      phone: selectedOffice.phone ?? '',
      timezone: selectedOffice.timezone,
      address: selectedOffice.address ?? '',
    });
  }, [reset, selectedOffice]);

  const saveOfficeMutation = useMutation({
    mutationFn: (values: OfficeFormValues) => updateClinicOffice(selectedOffice!.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'settings'] });
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] });
      message.success('Филиал сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <div className="page">
      <PageHeader title="Филиал" description="Кабинеты, боксы стационара и склады, которые используются в очереди, записях и складе." />
      {settingsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(settingsQuery.error)} className="form-alert" /> : null}
      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Text strong>Рабочие ресурсы клиники</Typography.Text>
            <Typography.Text type="secondary">Удаление ресурсов пока выключено, чтобы не повредить связанные записи.</Typography.Text>
          </Space>
          <Select
            value={selectedOffice?.id}
            loading={settingsQuery.isLoading}
            style={{ width: 260 }}
            options={offices.map((office) => ({ value: office.id, label: office.name }))}
            onChange={setSelectedOfficeId}
          />
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => navigate(tabRoutes[key] ?? '/settings/office')}
          items={[
            {
              key: 'profile',
              label: 'Профиль филиала',
              children: (
                <div className="list-panel-body">
                  <Form layout="vertical">
                    <div className="form-grid two-columns">
                      <Controller
                        control={control}
                        name="name"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || !selectedOffice} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="phone"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || !selectedOffice} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="timezone"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Часовой пояс" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || !selectedOffice} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        control={control}
                        name="address"
                        render={({ field, fieldState }) => (
                          <Form.Item label="Адрес" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                            <Input {...field} disabled={!canManage || !selectedOffice} />
                          </Form.Item>
                        )}
                      />
                    </div>
                    {canManage ? (
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={saveOfficeMutation.isPending}
                        disabled={!selectedOffice}
                        onClick={handleSubmit((values) => saveOfficeMutation.mutate(values))}
                      >
                        Сохранить филиал
                      </Button>
                    ) : null}
                  </Form>
                </div>
              ),
            },
            {
              key: 'schedule',
              label: 'График работы',
              children: <OfficeScheduleTab office={selectedOffice} canManage={canManage} />,
            },
            {
              key: 'rooms',
              label: 'Кабинеты',
              children: (
                <ResourceTable
                  title="Кабинеты"
                  kind="rooms"
                  items={selectedOffice?.rooms ?? []}
                  offices={offices}
                  selectedOfficeId={selectedOffice?.id}
                  canManage={canManage}
                />
              ),
            },
            {
              key: 'hospital',
              label: 'Стационар',
              children: (
                <ResourceTable
                  title="Боксы стационара"
                  kind="hospitalBoxes"
                  items={selectedOffice?.hospitalBoxes ?? []}
                  offices={offices}
                  selectedOfficeId={selectedOffice?.id}
                  canManage={canManage}
                />
              ),
            },
            {
              key: 'warehouses',
              label: 'Склады',
              children: (
                <ResourceTable
                  title="Склады"
                  kind="warehouses"
                  items={selectedOffice?.warehouses ?? []}
                  offices={offices}
                  selectedOfficeId={selectedOffice?.id}
                  canManage={canManage}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function OfficeScheduleTab({ office, canManage }: { office?: ClinicOfficeSettings; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [rows, setRows] = useState<OfficeScheduleRow[]>(() => buildScheduleRows(null));

  useEffect(() => {
    setRows(buildScheduleRows(office?.workingHours ?? null));
  }, [office?.id, office?.workingHours]);

  const saveMutation = useMutation({
    mutationFn: (workingHours: OfficeWorkingHours) => updateClinicOffice(office!.id, { workingHours }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'settings'] });
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] });
      message.success('График работы сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<OfficeScheduleRow>>(
    () => [
      {
        title: 'День',
        key: 'day',
        width: 180,
        render: (_, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.title}</Typography.Text>
            <Typography.Text type="secondary">{row.shortTitle}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Рабочий',
        dataIndex: 'isWorking',
        key: 'isWorking',
        width: 110,
        render: (value: boolean, row) => (
          <Checkbox checked={value} disabled={!canManage} onChange={(event) => updateScheduleRow(row.key, { isWorking: event.target.checked })} />
        ),
      },
      {
        title: 'Открытие',
        dataIndex: 'opensAt',
        key: 'opensAt',
        width: 150,
        render: (value: string, row) => (
          <Input
            type="time"
            value={value}
            disabled={!canManage || !row.isWorking}
            onChange={(event) => updateScheduleRow(row.key, { opensAt: event.target.value })}
          />
        ),
      },
      {
        title: 'Закрытие',
        dataIndex: 'closesAt',
        key: 'closesAt',
        width: 150,
        render: (value: string, row) => (
          <Input
            type="time"
            value={value}
            disabled={!canManage || !row.isWorking}
            onChange={(event) => updateScheduleRow(row.key, { closesAt: event.target.value })}
          />
        ),
      },
      {
        title: 'Перерыв с',
        dataIndex: 'breakStart',
        key: 'breakStart',
        width: 150,
        render: (value: string | null | undefined, row) => (
          <Input
            type="time"
            value={value ?? ''}
            disabled={!canManage || !row.isWorking}
            onChange={(event) => updateScheduleRow(row.key, { breakStart: event.target.value || null })}
          />
        ),
      },
      {
        title: 'Перерыв до',
        dataIndex: 'breakEnd',
        key: 'breakEnd',
        width: 150,
        render: (value: string | null | undefined, row) => (
          <Input
            type="time"
            value={value ?? ''}
            disabled={!canManage || !row.isWorking}
            onChange={(event) => updateScheduleRow(row.key, { breakEnd: event.target.value || null })}
          />
        ),
      },
    ],
    [canManage],
  );

  function updateScheduleRow(dayKey: WeekDayKey, patch: Partial<OfficeScheduleRow>) {
    setRows((current) => current.map((row) => (row.key === dayKey ? { ...row, ...patch } : row)));
  }

  function saveSchedule() {
    if (!office) {
      return;
    }

    const error = validateScheduleRows(rows);
    if (error) {
      message.error(error);
      return;
    }

    saveMutation.mutate(serializeScheduleRows(rows));
  }

  return (
    <div className="list-panel-body">
      <Space direction="vertical" size={14} className="full-width">
        <Alert
          type="info"
          showIcon
          message="График филиала"
          description="Эти часы нужны для расписания клиники, онлайн-записи и контроля рабочих сценариев. Часовой пояс задаётся в профиле филиала."
        />
        <Table<OfficeScheduleRow>
          rowKey="key"
          className="dense-table"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 980 }}
        />
        {canManage ? (
          <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} disabled={!office} onClick={saveSchedule}>
            Сохранить график
          </Button>
        ) : null}
      </Space>
    </div>
  );
}

function ResourceTable({
  title,
  kind,
  items,
  offices,
  selectedOfficeId,
  canManage,
}: {
  title: string;
  kind: ResourceKind;
  items: ResourceItem[];
  offices: ClinicOfficeSettings[];
  selectedOfficeId?: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ResourceItem | null>(null);
  const { control, handleSubmit, reset } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: { officeId: selectedOfficeId ?? '', name: '' },
  });

  useEffect(() => {
    if (!modalOpen) {
      reset({ officeId: selectedOfficeId ?? '', name: '' });
    }
  }, [modalOpen, reset, selectedOfficeId]);

  const saveMutation = useMutation({
    mutationFn: (values: ResourceFormValues) => saveResource(kind, editingItem?.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'settings'] });
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] });
      message.success(editingItem ? 'Ресурс сохранён' : 'Ресурс создан');
      closeModal();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<ResourceItem>>(
    () => [
      {
        title: 'Название',
        dataIndex: 'name',
        key: 'name',
        render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        title: 'Филиал',
        dataIndex: 'officeId',
        key: 'officeId',
        width: 240,
        render: (officeId: string) => <Tag>{offices.find((office) => office.id === officeId)?.name ?? 'Филиал'}</Tag>,
      },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_, record) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage, offices],
  );

  function openCreate() {
    setEditingItem(null);
    reset({ officeId: selectedOfficeId ?? offices[0]?.id ?? '', name: '' });
    setModalOpen(true);
  }

  function openEdit(item: ResourceItem) {
    setEditingItem(item);
    reset({ officeId: item.officeId, name: item.name });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingItem(null);
    reset({ officeId: selectedOfficeId ?? offices[0]?.id ?? '', name: '' });
  }

  return (
    <div className="list-panel-body">
      <div className="list-panel-header inner">
        <Typography.Text strong>{title}</Typography.Text>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!offices.length}>
            Добавить
          </Button>
        ) : null}
      </div>
      <Table<ResourceItem>
        rowKey="id"
        className="dense-table"
        columns={columns}
        dataSource={items}
        pagination={false}
        locale={{ emptyText: 'Ресурсы ещё не добавлены' }}
        onRow={(record) => ({ onDoubleClick: () => canManage && openEdit(record) })}
      />
      <Modal
        title={editingItem ? 'Редактирование ресурса' : 'Новый ресурс'}
        open={modalOpen}
        onCancel={closeModal}
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
          <Controller
            control={control}
            name="officeId"
            render={({ field, fieldState }) => (
              <Form.Item label="Филиал" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select {...field} options={offices.map((office) => ({ value: office.id, label: office.name }))} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} autoFocus />
              </Form.Item>
            )}
          />
        </Form>
      </Modal>
    </div>
  );
}

function saveResource(kind: ResourceKind, id: string | undefined, values: SchedulingResourcePayload) {
  if (kind === 'rooms') {
    return id ? updateRoom(id, values) : createRoom(values);
  }

  if (kind === 'hospitalBoxes') {
    return id ? updateHospitalBox(id, values) : createHospitalBox(values);
  }

  return id ? updateWarehouse(id, values) : createWarehouse(values);
}

function buildScheduleRows(workingHours: OfficeWorkingHours | null): OfficeScheduleRow[] {
  return weekDays.map((day, index) => {
    const savedDay = workingHours?.[day.key];
    const fallback = getDefaultWorkingDay(index);

    return {
      key: day.key,
      title: day.title,
      shortTitle: day.shortTitle,
      isWorking: savedDay?.isWorking ?? fallback.isWorking,
      opensAt: savedDay?.opensAt ?? fallback.opensAt,
      closesAt: savedDay?.closesAt ?? fallback.closesAt,
      breakStart: savedDay?.breakStart ?? fallback.breakStart ?? null,
      breakEnd: savedDay?.breakEnd ?? fallback.breakEnd ?? null,
    };
  });
}

function getDefaultWorkingDay(index: number): OfficeWorkingDay {
  if (index <= 4) {
    return { isWorking: true, opensAt: '09:00', closesAt: '20:00', breakStart: null, breakEnd: null };
  }

  if (index === 5) {
    return { isWorking: true, opensAt: '10:00', closesAt: '18:00', breakStart: null, breakEnd: null };
  }

  return { isWorking: false, opensAt: '10:00', closesAt: '18:00', breakStart: null, breakEnd: null };
}

function serializeScheduleRows(rows: OfficeScheduleRow[]): OfficeWorkingHours {
  return rows.reduce<OfficeWorkingHours>((acc, row) => {
    acc[row.key] = {
      isWorking: row.isWorking,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      breakStart: row.breakStart || null,
      breakEnd: row.breakEnd || null,
    };

    return acc;
  }, {});
}

function validateScheduleRows(rows: OfficeScheduleRow[]) {
  for (const row of rows) {
    if (!row.isWorking) {
      continue;
    }

    if (!row.opensAt || !row.closesAt) {
      return `${row.title}: укажите время открытия и закрытия`;
    }

    if (row.opensAt >= row.closesAt) {
      return `${row.title}: время закрытия должно быть позже открытия`;
    }

    if ((row.breakStart && !row.breakEnd) || (!row.breakStart && row.breakEnd)) {
      return `${row.title}: укажите начало и окончание перерыва`;
    }

    if (row.breakStart && row.breakEnd) {
      if (row.breakStart >= row.breakEnd) {
        return `${row.title}: окончание перерыва должно быть позже начала`;
      }

      if (row.breakStart <= row.opensAt || row.breakEnd >= row.closesAt) {
        return `${row.title}: перерыв должен быть внутри рабочего дня`;
      }
    }
  }

  return null;
}

function getActiveTab(pathname: string) {
  if (pathname.endsWith('/schedule')) {
    return 'schedule';
  }

  if (pathname.endsWith('/rooms')) {
    return 'rooms';
  }

  if (pathname.endsWith('/hospital')) {
    return 'hospital';
  }

  if (pathname.endsWith('/warehouses')) {
    return 'warehouses';
  }

  return 'profile';
}
