import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  FileTextOutlined,
  LeftOutlined,
  LoginOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { createQueueEntry } from '../queue/queue.api';
import {
  arriveAppointment,
  cancelAppointment,
  completeAppointment,
  getAppointment,
  startAppointment,
  updateAppointment,
} from './appointments.api';
import { AppointmentFormDrawer, AppointmentFormSubmit } from './AppointmentFormDrawer';
import {
  Appointment,
  appointmentStatusColors,
  appointmentStatusLabels,
} from './types';

export function AppointmentCardPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'appointments.manage');
  const canManageVisits = hasPermission(auth?.employee, 'visits.manage');
  const [editOpen, setEditOpen] = useState(false);
  const appointmentQuery = useQuery({
    queryKey: ['appointments', appointmentId],
    queryFn: () => getAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
  });
  const updateMutation = useMutation({
    mutationFn: (values: AppointmentFormSubmit) => updateAppointment(appointmentId!, values.appointment),
    onSuccess: async () => {
      await invalidate();
      setEditOpen(false);
      message.success('Запись сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const queueMutation = useMutation({
    mutationFn: async (appointment: Appointment) => {
      if (appointment.status === 'PLANNED') {
        await arriveAppointment(appointment.id);
      }

      return createQueueEntry({
        officeId: appointment.officeId ?? undefined,
        ownerId: appointment.ownerId,
        animalId: appointment.animalId,
        employeeId: appointment.employeeId ?? undefined,
        roomId: appointment.roomId ?? undefined,
        urgency: 'PLANNED',
        comment: `Запись на ${formatDateTime(appointment.startsAt)}`,
      });
    },
    onSuccess: async (queueEntry) => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
      ]);
      message.success('Клиент поставлен в очередь');
      navigate(`/queue/${queueEntry.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'arrive' | 'start' | 'complete' | 'cancel') => {
      if (action === 'arrive') {
        return arriveAppointment(appointmentId!);
      }

      if (action === 'start') {
        return startAppointment(appointmentId!);
      }

      if (action === 'complete') {
        return completeAppointment(appointmentId!);
      }

      return cancelAppointment(appointmentId!);
    },
    onSuccess: async () => {
      await invalidate();
      message.success('Статус записи обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    ]);
  }

  const appointment = appointmentQuery.data;

  if (appointmentQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Запись" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(appointmentQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={appointment ? `${appointment.animal?.nickname ?? 'Пациент'} — ${formatDateTime(appointment.startsAt)}` : 'Запись'}
        description="Карточка записи на приём."
        extra={
          <Space wrap>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/schedule')}>
              К списку
            </Button>
            {canManage && appointment ? (
              <>
                {appointment.status === 'PLANNED' ? (
                  <Button icon={<LoginOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('arrive')}>
                    Пришёл
                  </Button>
                ) : null}
                {['PLANNED', 'ARRIVED'].includes(appointment.status) ? (
                  <Button
                    icon={<OrderedListOutlined />}
                    loading={queueMutation.isPending}
                    onClick={() => queueMutation.mutate(appointment)}
                  >
                    Поставить в очередь
                  </Button>
                ) : null}
                {appointment.status === 'ARRIVED' ? (
                  <Button icon={<PlayCircleOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('start')}>
                    Начать
                  </Button>
                ) : null}
                {appointment.status === 'IN_PROGRESS' ? (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={actionMutation.isPending}
                    onClick={() => actionMutation.mutate('complete')}
                  >
                    Завершить
                  </Button>
                ) : null}
                {['PLANNED', 'ARRIVED', 'IN_PROGRESS'].includes(appointment.status) ? (
                  <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                    Отменить
                  </Button>
                ) : null}
                {appointment.visit ? (
                  <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits/${appointment.visit?.id}`)}>
                    Открыть приём
                  </Button>
                ) : canManageVisits && ['PLANNED', 'ARRIVED', 'IN_PROGRESS'].includes(appointment.status) ? (
                  <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits?appointmentId=${appointment.id}`)}>
                    Создать приём
                  </Button>
                ) : null}
                <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                  Редактировать
                </Button>
              </>
            ) : null}
          </Space>
        }
      />
      <Card loading={appointmentQuery.isLoading}>
        {appointment ? (
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Владелец">{appointment.owner?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{appointment.owner?.phone ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Пациент">
              <Space size={6}>
                <AnimalSpeciesLabel species={appointment.animal?.species} fallback="Вид не указан" />
                <span>{appointment.animal?.nickname ?? '—'}</span>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Вид">
              <AnimalSpeciesLabel species={appointment.animal?.species} />
            </Descriptions.Item>
            <Descriptions.Item label="Статус">
              <Tag color={appointmentStatusColors[appointment.status]}>{appointmentStatusLabels[appointment.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Начало">{formatDateTime(appointment.startsAt)}</Descriptions.Item>
            <Descriptions.Item label="Окончание">{formatDateTime(appointment.endsAt)}</Descriptions.Item>
            <Descriptions.Item label="Сотрудник">{appointment.employee?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Кабинет">{appointment.room?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Филиал">{appointment.office?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Комментарий" span={2}>
              {appointment.comment || '—'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>
      <AppointmentFormDrawer
        open={editOpen}
        title="Редактировать запись"
        initialAppointment={appointment}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
    </div>
  );
}
