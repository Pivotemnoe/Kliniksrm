import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Popconfirm, Select, Space, Tag } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { registerQueueWorkstation, updateQueueWorkstation } from './queue.api';

import { getQueueWorkstationDeviceId } from './workstationDevice';

export function useQueueWorkstationDeviceId() {
  const [deviceId] = useState(() => { try { return getQueueWorkstationDeviceId(); } catch { return null; } });
  return deviceId;
}

export function WorkstationHeartbeat() {
  const deviceId = useQueueWorkstationDeviceId();
  useQuery({
    queryKey: ['queue-workstation', deviceId],
    queryFn: () => registerQueueWorkstation(deviceId!),
    enabled: Boolean(deviceId),
    refetchInterval: 15_000,
  });
  return null;
}

export function CurrentWorkstation({ canChange }: { canChange: boolean }) {
  const deviceId = useQueueWorkstationDeviceId();
  return deviceId ? <QueueWorkstationRoomSelect deviceId={deviceId} canChange={canChange} /> : <Alert type="warning" message="Не удалось сохранить рабочее место: разрешите хранение данных сайта в браузере" />;
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
  const selectedLabel = workstation?.isReception ? 'Администратор' : workstation?.room
    ? `${workstation.room.office.name} — ${workstation.room.name}`
    : undefined;
  const presetNames = ['Приёмная 1', 'Приёмная 2', 'Процедурная', 'Стационар'];
  const presets = (resourcesQuery.data?.offices ?? []).flatMap((office) => presetNames
    .filter((name) => !(resourcesQuery.data?.rooms ?? []).some((room) => room.officeId === office.id && room.name.toLowerCase().replaceAll('ё', 'е').trim() === name.toLowerCase().replaceAll('ё', 'е')))
    .map((name) => ({ value: `preset:${office.id}:${name}`, label: `${office.name} — ${name}` })));
  const updateMutation = useMutation({
    mutationFn: (value: string | null) => {
      if (!workstation) throw new Error('Подождите регистрации рабочего места');
      if (value === null) return updateQueueWorkstation(workstation.id, { roomId: null, isReception: false });
      if (value === 'administrator') return updateQueueWorkstation(workstation.id, { roomId: null, isReception: true });
      if (value.startsWith('preset:')) {
        const [, officeId, roomName] = value.split(':');
        return updateQueueWorkstation(workstation.id, { officeId, roomName, isReception: false });
      }
      return updateQueueWorkstation(workstation.id, { roomId: value, isReception: false });
    },
    onSuccess: async (_, value) => {
      await queryClient.invalidateQueries({ queryKey: ['queue-workstation', deviceId] });
      await queryClient.invalidateQueries({ queryKey: ['queue-workstations'] });
      await queryClient.invalidateQueries({ queryKey: ['scheduling', 'resources'] });
      setEditing(false);
      message.success(value === null ? 'Рабочее место отвязано' : 'Рабочее место сохранено');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  if (workstationQuery.isError) return <Alert type="warning" showIcon message="Не удалось проверить рабочее место" description={getErrorMessage(workstationQuery.error)} />;

  if ((workstation?.roomId || workstation?.isReception) && !editing) {
    return (
      <Space size={4} wrap>
        <Tag color="blue">Рабочее место: {selectedLabel ?? 'кабинет настроен'}</Tag>
        <Tag>Компьютер {deviceId.slice(0, 8)}</Tag>
        {canChange ? <>
          <Button type="link" size="small" onClick={() => setEditing(true)}>Изменить рабочее место</Button>
          <Popconfirm title="Отвязать этот компьютер?" description="Перед следующим вызовом нужно будет выбрать рабочее место заново." onConfirm={() => updateMutation.mutateAsync(null)}>
            <Button type="link" size="small" danger loading={updateMutation.isPending}>Отвязать</Button>
          </Popconfirm>
        </> : null}
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
        value={workstation?.isReception ? 'administrator' : workstation?.roomId ?? undefined}
        loading={resourcesQuery.isLoading || workstationQuery.isLoading || updateMutation.isPending}
        placeholder="Кабинет этого компьютера"
        aria-label="Кабинет этого компьютера"
        style={{ minWidth: 245, maxWidth: '100%' }}
        options={[{ value: 'administrator', label: 'Администратор' }, ...options, ...presets]}
        disabled={!workstation || updateMutation.isPending}
        onChange={(roomId) => updateMutation.mutate(roomId)}
      />
      <Tag>Компьютер {deviceId.slice(0, 8)}</Tag>
      {editing ? <Button onClick={() => setEditing(false)}>Отмена</Button> : null}
    </Space>
  );
}
