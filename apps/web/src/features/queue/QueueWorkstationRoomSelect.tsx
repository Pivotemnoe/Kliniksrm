import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Select, Space, Tag } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { registerQueueWorkstation, updateQueueWorkstation } from './queue.api';

const storageKey = 'temichevvet.queue.workstation-device-id.v1';

export function useQueueWorkstationDeviceId() {
  const [deviceId] = useState(() => {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  });
  return deviceId;
}

export function QueueWorkstationRoomSelect({
  deviceId,
  canChange = false,
}: {
  deviceId: string;
  canChange?: boolean;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const workstationQuery = useQuery({
    queryKey: ['queue-workstation', deviceId],
    queryFn: () => registerQueueWorkstation(deviceId),
    refetchInterval: 15_000,
  });
  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
  });
  const offices = new Map(resourcesQuery.data?.offices.map((office) => [office.id, office.name]) ?? []);
  const options = (resourcesQuery.data?.rooms ?? []).map((room) => ({
    value: room.id,
    label: `${offices.get(room.officeId) ?? 'Клиника'} — ${room.name}`,
  }));
  const workstation = workstationQuery.data;
  const selectedLabel = workstation?.room
    ? `${workstation.room.office.name} — ${workstation.room.name}`
    : undefined;
  const updateMutation = useMutation({
    mutationFn: (roomId: string) => updateQueueWorkstation(workstation!.id, { roomId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue-workstation', deviceId] });
      await queryClient.invalidateQueries({ queryKey: ['queue-workstations'] });
      setEditing(false);
      message.success('Кабинет рабочего компьютера сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  if (workstation?.roomId && !editing) {
    return (
      <Space size={4} wrap>
        <Tag color="blue">Рабочее место: {selectedLabel ?? 'кабинет настроен'}</Tag>
        <Tag>Компьютер {deviceId.slice(0, 8)}</Tag>
        {canChange ? <Button type="link" size="small" onClick={() => setEditing(true)}>Изменить привязку</Button> : null}
      </Space>
    );
  }

  if (!canChange) {
    return (
      <Space size={4} wrap>
        <Tag color="red">Рабочее место не привязано к кабинету</Tag>
        <Tag>Компьютер {deviceId.slice(0, 8)}</Tag>
      </Space>
    );
  }

  return (
    <Space size={4} wrap>
      <Select
        showSearch
        optionFilterProp="label"
        value={workstation?.roomId ?? undefined}
        loading={resourcesQuery.isLoading || workstationQuery.isLoading || updateMutation.isPending}
        placeholder="Кабинет этого компьютера"
        aria-label="Кабинет этого компьютера"
        style={{ minWidth: 245, maxWidth: '100%' }}
        options={options}
        onChange={(roomId) => updateMutation.mutate(roomId)}
      />
      <Tag>Компьютер {deviceId.slice(0, 8)}</Tag>
    </Space>
  );
}
