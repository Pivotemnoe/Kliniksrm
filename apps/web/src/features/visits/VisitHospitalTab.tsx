import { CheckOutlined, HomeOutlined, SwapOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import {
  cancelHospitalStay,
  dischargeHospitalStay,
  getHospitalResources,
} from '../hospital/hospital.api';
import { updateVisit } from './visits.api';
import { Visit, visitStatusColors, visitStatusLabels } from './types';

export function VisitHospitalTab({ visit, locked }: { visit: Visit; locked: boolean }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'hospital.manage') && !locked;
  const [hospitalBoxId, setHospitalBoxId] = useState<string | undefined>(visit.hospitalBoxId ?? undefined);
  const resourcesQuery = useQuery({ queryKey: ['hospital', 'resources'], queryFn: getHospitalResources });
  const assignMutation = useMutation({
    mutationFn: (boxId: string) => updateVisit(visit.id, { hospitalBoxId: boxId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['hospital'] }),
      ]);
      message.success('Стационар обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'discharge' | 'cancel') =>
      action === 'discharge' ? dischargeHospitalStay(visit.id) : cancelHospitalStay(visit.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['hospital'] }),
      ]);
      message.success('Статус стационара обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    setHospitalBoxId(visit.hospitalBoxId ?? undefined);
  }, [visit.hospitalBoxId]);

  const boxOptions = resourcesQuery.data?.boxes.map((box) => ({ value: box.id, label: box.name })) ?? [];

  return (
    <div className="visit-tab-panel">
      <div className="tab-toolbar">
        <div>
          <Typography.Title level={4}>Стационар</Typography.Title>
          <Typography.Text type="secondary">Бокс, текущий статус и выписка пациента из стационара.</Typography.Text>
        </div>
      </div>
      <Descriptions bordered column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Пациент">{visit.animal.nickname}</Descriptions.Item>
        <Descriptions.Item label="Владелец">{visit.owner.fullName}</Descriptions.Item>
        <Descriptions.Item label="Статус">
          <Tag color={visitStatusColors[visit.status]}>{visitStatusLabels[visit.status]}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Бокс">{visit.hospitalBox?.name ?? visit.hospitalBox?.title ?? 'Не размещён'}</Descriptions.Item>
      </Descriptions>
      {canManage ? (
        <div className="visit-action-row">
          <Select
            className="visit-hospital-select"
            value={hospitalBoxId}
            placeholder="Выберите бокс"
            loading={resourcesQuery.isLoading}
            options={boxOptions}
            onChange={setHospitalBoxId}
          />
          <Button
            icon={visit.hospitalBoxId ? <SwapOutlined /> : <HomeOutlined />}
            loading={assignMutation.isPending}
            disabled={!hospitalBoxId}
            onClick={() => hospitalBoxId && assignMutation.mutate(hospitalBoxId)}
          >
            {visit.hospitalBoxId ? 'Перевести' : 'Поместить'}
          </Button>
          {visit.hospitalBoxId ? (
            <Space wrap>
              <Button icon={<CheckOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('discharge')}>
                Выписать
              </Button>
              <Button danger icon={<StopOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                Отменить
              </Button>
            </Space>
          ) : null}
        </div>
      ) : (
        <Typography.Text type="secondary">У вашей роли нет права менять стационар или приём уже закрыт.</Typography.Text>
      )}
    </div>
  );
}
