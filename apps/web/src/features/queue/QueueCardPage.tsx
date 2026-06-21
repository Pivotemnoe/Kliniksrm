import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  FileTextOutlined,
  LeftOutlined,
  PhoneOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { AnimalMutationInput } from '../animals/types';
import { createOwner, createOwnerAnimal } from '../owners/owners.api';
import { OwnerMutationInput } from '../owners/types';
import {
  cancelQueueEntry,
  completeQueueEntry,
  getQueueEntry,
  startQueueEntry,
  updateQueueEntry,
} from './queue.api';
import { QueueFormDrawer } from './QueueFormDrawer';
import { QueueCreateCardsDrawer } from './QueueCreateCardsDrawer';
import { QueueMutationInput, getQueueDisplayStatus, queueUrgencyColors, queueUrgencyLabels } from './types';

type QueueCardsInput = {
  owner: OwnerMutationInput;
  animal: AnimalMutationInput;
  afterCreate?: 'visit';
};

const queueAcceptDelayMs = 10_000;

export function QueueCardPage() {
  const { queueEntryId } = useParams<{ queueEntryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'queue.manage');
  const canCallQueue = hasPermission(auth?.employee, 'queue.call') || canManage;
  const canManageVisits = hasPermission(auth?.employee, 'visits.manage');
  const [editOpen, setEditOpen] = useState(false);
  const [createCardsOpen, setCreateCardsOpen] = useState(false);
  const now = useNow();
  const queueQuery = useQuery({
    queryKey: ['queue', queueEntryId],
    queryFn: () => getQueueEntry(queueEntryId!),
    enabled: Boolean(queueEntryId),
  });
  const updateMutation = useMutation({
    mutationFn: (values: QueueMutationInput) => updateQueueEntry(queueEntryId!, values),
    onSuccess: async () => {
      await invalidate();
      setEditOpen(false);
      message.success('Очередь сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'start' | 'repeat' | 'complete' | 'cancel') => {
      if (action === 'start' || action === 'repeat') {
        return startQueueEntry(queueEntryId!);
      }

      if (action === 'complete') {
        return completeQueueEntry(queueEntryId!);
      }

      return cancelQueueEntry(queueEntryId!);
    },
    onSuccess: async (_, action) => {
      await invalidate();
      const successText = {
        start: 'Клиент вызван на приём',
        repeat: 'Вызов повторён',
        complete: 'Пациент направлен на приём',
        cancel: 'Очередь отменена',
      }[action];
      message.success(successText);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const createCardsMutation = useMutation({
    mutationFn: async (values: QueueCardsInput) => {
      const owner = await createOwner(values.owner);
      const animal = await createOwnerAnimal(owner.id, values.animal);
      await updateQueueEntry(queueEntryId!, {
        ownerId: owner.id,
        animalId: animal.id,
      });
      return { owner, animal };
    },
    onSuccess: async (_, values) => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      setCreateCardsOpen(false);
      message.success('Карточки владельца и пациента созданы');
      if (values.afterCreate === 'visit') {
        navigate(`/visits?queueEntryId=${queueEntryId}`);
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['queue', queueEntryId] }),
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
    ]);
  }

  const queueEntry = queueQuery.data;
  const acceptWaitSeconds =
    queueEntry?.status === 'IN_PROGRESS' ? getQueueAcceptWaitSeconds(queueEntry.lastCalledAt ?? queueEntry.startedAt, now) : 0;
  const statusView = queueEntry ? getQueueDisplayStatus(queueEntry) : null;

  if (queueQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Очередь" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(queueQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={queueEntry ? getClientName(queueEntry) : 'Очередь'}
        description="Карточка электронной очереди."
        extra={
          <Space wrap>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/queue')}>
              К списку
            </Button>
            {queueEntry ? (
              <>
                {canCallQueue && queueEntry.status === 'WAITING' ? (
                  <Button
                    icon={<PhoneOutlined />}
                    loading={actionMutation.isPending}
                    onClick={() => actionMutation.mutate('start')}
                  >
                    Вызвать
                  </Button>
                ) : null}
                {canCallQueue && queueEntry.status === 'IN_PROGRESS' ? (
                  <>
                    <Button
                      icon={<PhoneOutlined />}
                      loading={actionMutation.isPending}
                      onClick={() => actionMutation.mutate('repeat')}
                    >
                      Повторить вызов
                    </Button>
                    {canManageVisits ? (
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={actionMutation.isPending}
                        disabled={acceptWaitSeconds > 0}
                        onClick={() => actionMutation.mutate('complete')}
                      >
                        {acceptWaitSeconds > 0 ? `Начать через ${acceptWaitSeconds} с` : 'Начать приём'}
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {canManage && (queueEntry.status === 'WAITING' || queueEntry.status === 'IN_PROGRESS') ? (
                  <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                    Отменить
                  </Button>
                ) : null}
                {canManage && (!queueEntry.ownerId || !queueEntry.animalId) ? (
                  <Button icon={<UserAddOutlined />} onClick={() => setCreateCardsOpen(true)}>
                    Завести карточки
                  </Button>
                ) : null}
                {queueEntry.visit ? (
                  <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits/${queueEntry.visit?.id}`)}>
                    Открыть приём
                  </Button>
                ) : canManageVisits && queueEntry.ownerId && queueEntry.animalId && ['WAITING', 'IN_PROGRESS', 'COMPLETED'].includes(queueEntry.status) ? (
                  <Button icon={<FileTextOutlined />} onClick={() => navigate(`/visits?queueEntryId=${queueEntry.id}`)}>
                    Создать приём
                  </Button>
                ) : null}
                {canManage ? (
                  <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                    Редактировать
                  </Button>
                ) : null}
              </>
            ) : null}
          </Space>
        }
      />
      <Card loading={queueQuery.isLoading}>
        {queueEntry ? (
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Клиент">{getClientName(queueEntry)}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{queueEntry.owner?.phone ?? queueEntry.phone ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Адрес">{queueEntry.owner?.address ?? queueEntry.ownerAddress ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Пациент">
              <Space size={6}>
                <AnimalSpeciesLabel species={queueEntry.animal?.species ?? queueEntry.animalSpecies} fallback="Вид не указан" />
                <span>{queueEntry.animal?.nickname ?? queueEntry.animalNickname ?? '—'}</span>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Вид">
              <AnimalSpeciesLabel species={queueEntry.animal?.species ?? queueEntry.animalSpecies} />
            </Descriptions.Item>
            <Descriptions.Item label="Порода">{queueEntry.animal?.breed ?? queueEntry.animalBreed ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Срочность">
              <Tag color={queueUrgencyColors[queueEntry.urgency]}>{queueUrgencyLabels[queueEntry.urgency]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Статус">
              {statusView ? <Tag color={statusView.color}>{statusView.label}</Tag> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Сотрудник">{queueEntry.employee?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Филиал">{queueEntry.office?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Кабинет">{queueEntry.room?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Создана">{formatDateTime(queueEntry.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Начата">{formatDateTime(queueEntry.startedAt)}</Descriptions.Item>
            <Descriptions.Item label="Последний вызов">{formatDateTime(queueEntry.lastCalledAt)}</Descriptions.Item>
            <Descriptions.Item label="Количество вызовов">{queueEntry.callCount || '—'}</Descriptions.Item>
            <Descriptions.Item label="Направлен на приём">{formatDateTime(queueEntry.completedAt)}</Descriptions.Item>
            <Descriptions.Item label="Комментарий" span={2}>
              {queueEntry.comment || '—'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>
      <QueueFormDrawer
        open={editOpen}
        title="Редактировать очередь"
        initialQueue={queueEntry}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
      <QueueCreateCardsDrawer
        open={createCardsOpen}
        queueEntry={queueEntry}
        canOpenVisit={canManageVisits && queueEntry ? ['WAITING', 'IN_PROGRESS', 'COMPLETED'].includes(queueEntry.status) : false}
        onClose={() => setCreateCardsOpen(false)}
        onSubmit={(values, afterCreate) => createCardsMutation.mutate({ ...values, afterCreate })}
        isSubmitting={createCardsMutation.isPending}
        submitError={createCardsMutation.error}
      />
    </div>
  );
}

function getClientName(queueEntry: { owner?: { fullName: string } | null; ownerName: string | null }) {
  return queueEntry.owner?.fullName ?? queueEntry.ownerName ?? 'Клиент без карточки';
}

function useNow() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timerId);
  }, []);

  return now;
}

function getQueueAcceptWaitSeconds(startedAt: string | null, now: number) {
  if (!startedAt) {
    return Math.ceil(queueAcceptDelayMs / 1000);
  }

  const elapsedMs = now - new Date(startedAt).getTime();

  return Math.max(0, Math.ceil((queueAcceptDelayMs - elapsedMs) / 1000));
}
