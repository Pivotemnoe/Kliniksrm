import { EditOutlined, LeftOutlined, PlusOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Input, Modal, Tabs, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { formatAnimalAge, formatAnimalBirthDateDisplay } from '../../shared/utils/animalBirthDate';
import { formatDate as formatRuDate, formatDateTime } from '../../shared/utils/date';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { listVisits } from '../visits/visits.api';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { AnimalArchiveModal, animalArchiveReasonLabels } from './AnimalArchiveModal';
import { AnimalFormDrawer } from './AnimalFormDrawer';
import { AnimalTasksTab } from './AnimalTasksTab';
import { AnimalVisitsTab } from './AnimalVisitsTab';
import { AnimalVaccinationsTab } from './AnimalVaccinationsTab';
import { AnimalWeightsTab } from './AnimalWeightsTab';
import { AnimalStatusTag, getAnimalStatusLabel } from './animalStatus';
import { archiveAnimal, getAnimal, restoreAnimal, updateAnimal } from './animals.api';
import { AnimalArchiveInput, AnimalMutationInput, Vaccination } from './types';
import { PatientDocumentArchive } from '../files/PatientDocumentArchive';

export function AnimalCardPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'animals.manage');
  const [editOpen, setEditOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const animalQuery = useQuery({
    queryKey: ['animals', animalId],
    queryFn: () => getAnimal(animalId!),
    enabled: Boolean(animalId),
  });
  const visitsSummaryQuery = useQuery({
    queryKey: ['visits', 'animal-context', { animalId, limit: 5, offset: 0 }],
    queryFn: () => listVisits({ animalId: animalId!, limit: 5, offset: 0 }),
    enabled: Boolean(animalId),
  });
  const updateMutation = useMutation({
    mutationFn: (values: AnimalMutationInput) => updateAnimal(animalId!, values),
    onSuccess: async (animal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', animal.ownerId, 'animals'] }),
      ]);
      setEditOpen(false);
      message.success('Карточка пациента сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const renameMutation = useMutation({
    mutationFn: (nextNickname: string) => updateAnimal(animalId!, { nickname: nextNickname.trim() }),
    onSuccess: async (updatedAnimal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', updatedAnimal.ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
      ]);
      setRenameOpen(false);
      message.success('Кличка пациента изменена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: (input: AnimalArchiveInput) => archiveAnimal(animalId!, input),
    onSuccess: async (archived) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', archived.ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', archived.ownerId, 'animals'] }),
      ]);
      setArchiveOpen(false);
      message.success(`Пациент «${archived.nickname}» перемещён в архив. История сохранена`);
      navigate(`/owners/${archived.ownerId}`, { replace: true });
    },
    onError: (error) => message.error(getErrorMessage(error), 8),
  });
  const restoreMutation = useMutation({
    mutationFn: () => restoreAnimal(animalId!),
    onSuccess: async (restored) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['animals', animalId] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', restored.ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', restored.ownerId, 'animals'] }),
      ]);
      message.success(`Пациент «${restored.nickname}» восстановлен`);
    },
    onError: (error) => message.error(getErrorMessage(error), 8),
  });
  const animal = animalQuery.data;
  const visits = visitsSummaryQuery.data?.items ?? [];
  const latestVisit = visits[0];
  const diagnosisCount = visits.reduce((sum, visit) => sum + (visit._count?.diagnoses ?? 0), 0);
  const latestWeight = animal?.weights?.[0];
  const latestVaccination = getLatestVaccination(animal?.vaccinations);
  const nextRevaccination = getNextRevaccination(animal?.vaccinations);

  function confirmRestore() {
    if (!animal) return;
    modal.confirm({
      title: `Восстановить пациента «${animal.nickname}»?`,
      content: 'Карточка снова появится в активном списке и станет доступна для новых записей, очереди и приёмов.',
      okText: 'Восстановить',
      cancelText: 'Отмена',
      onOk: () => restoreMutation.mutateAsync(),
    });
  }

  if (animalQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Пациент" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(animalQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="workbench">
      <aside className="context-panel">
        <div className="context-section">
          <div className="context-section-header">
            <button className="table-link" type="button" onClick={() => navigate('/patients')}>
              <LeftOutlined /> К пациентам
            </button>
          </div>
          <div className="context-section-body">
            <h2 className="context-title">{animal?.nickname ?? 'Пациент'}</h2>
            {animal?.archivedAt ? <Tag color="default">В архиве</Tag> : null}
            {animal && canManage && !animal.archivedAt ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setNickname(animal.nickname);
                  setRenameOpen(true);
                }}
              >
                Изменить кличку
              </Button>
            ) : null}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Профиль</strong>
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={!animal || !canManage || Boolean(animal.archivedAt)}>
              Редактировать профиль
            </Button>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Вид" value={<AnimalSpeciesLabel species={animal?.species} />} />
            <ContextRow label="Порода" value={animal?.breed} />
            <ContextRow label="Пол" value={animal ? sexLabel[animal.sex] : undefined} />
            <ContextRow label="Возраст" value={formatAnimalAge(animal?.birthDate)} />
            <ContextRow label="Стерилизация" value={animal?.isSterilized ? 'Да' : 'Нет'} />
            <ContextRow label="Состояние" value={animal ? <AnimalStatusTag status={animal.status} /> : undefined} />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Владелец</strong>
          </div>
          <div className="context-section-body">
            {animal?.owner ? (
              <Typography.Link onClick={() => navigate(`/owners/${animal.owner?.id}`)}>{animal.owner.fullName}</Typography.Link>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Медконтекст</strong>
            {animal ? (
              <Button
                size="small"
                type="link"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/visits?ownerId=${animal.ownerId}&animalId=${animal.id}`)}
                disabled={Boolean(animal.archivedAt)}
              >
                приём
              </Button>
            ) : null}
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Всего приёмов" value={animal?._count?.visits} />
            <ContextRow
              label="Последний приём"
              value={
                latestVisit ? (
                  <button className="table-link context-link" type="button" onClick={() => navigate(`/visits/${latestVisit.id}`)}>
                    {formatDateTime(latestVisit.startedAt)}
                  </button>
                ) : (
                  '—'
                )
              }
            />
            <ContextRow
              label="Статус приёма"
              value={
                latestVisit ? <Tag color={visitStatusColors[latestVisit.status]}>{visitStatusLabels[latestVisit.status]}</Tag> : '—'
              }
            />
            <ContextRow label="Диагнозы" value={diagnosisCount > 0 ? `${diagnosisCount} в последних приёмах` : '—'} />
            <ContextRow
              label="Последний вес"
              value={latestWeight ? `${latestWeight.weightKg} кг · ${formatRuDate(latestWeight.measuredAt)}` : '—'}
            />
            <ContextRow label="Вакцина" value={latestVaccination ? vaccinationLabel(latestVaccination) : '—'} />
            <ContextRow label="Ревакцинация" value={<RevaccinationValue vaccination={nextRevaccination} />} />
          </div>
        </div>
        {animal && canManage ? (
          <div className="context-section">
            <div className="context-section-header">
              <strong>Действия</strong>
            </div>
            <div className="context-section-body">
              {animal.archivedAt ? (
                <Button size="small" icon={<UndoOutlined />} loading={restoreMutation.isPending} onClick={confirmRestore}>
                  Восстановить пациента
                </Button>
              ) : (
                <Button danger size="small" icon={<StopOutlined />} onClick={() => setArchiveOpen(true)}>
                  Убрать из активных
                </Button>
              )}
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                {animal.archivedAt
                  ? `Причина: ${animal.archiveReason ? animalArchiveReasonLabels[animal.archiveReason] : 'не указана'}${animal.archiveComment ? `. ${animal.archiveComment}` : ''}`
                  : 'Карточка будет архивирована. История лечения, документов и оплат не удаляется.'}
              </Typography.Paragraph>
            </div>
          </div>
        ) : null}
      </aside>
      <main className="work-area">
        <div className="work-surface">
          {animal ? (
            <Tabs
              items={[
                {
                  key: 'visits',
                  label: 'Приёмы',
                  children: <AnimalVisitsTab ownerId={animal.ownerId} animalId={animal.id} readOnly={Boolean(animal.archivedAt)} />,
                },
                {
                  key: 'profile',
                  label: 'Профиль',
                  children: (
                    <Descriptions bordered column={{ xs: 1, md: 2 }}>
                      <Descriptions.Item label="Кличка">{animal.nickname}</Descriptions.Item>
                      <Descriptions.Item label="Владелец">
                        {animal.owner ? (
                          <Typography.Link onClick={() => navigate(`/owners/${animal.owner?.id}`)}>
                            {animal.owner.fullName}
                          </Typography.Link>
                        ) : (
                          '—'
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="Вид">
                        <AnimalSpeciesLabel species={animal.species} />
                      </Descriptions.Item>
                      <Descriptions.Item label="Порода">{animal.breed || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Пол">{sexLabel[animal.sex] ?? animal.sex}</Descriptions.Item>
                      <Descriptions.Item label="Возраст">{formatAnimalAge(animal.birthDate)}</Descriptions.Item>
                      <Descriptions.Item label="Дата рождения">{formatAnimalBirthDateDisplay(animal.birthDate)}</Descriptions.Item>
                      <Descriptions.Item label="Окрас">{animal.color || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Микрочип">{animal.microchip || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Клеймо">{animal.mark || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Состояние">{getAnimalStatusLabel(animal.status)}</Descriptions.Item>
                      <Descriptions.Item label="Стерилизация">{animal.isSterilized ? 'Да' : 'Нет'}</Descriptions.Item>
                      <Descriptions.Item label="Избранный">{animal.isFavorite ? 'Да' : 'Нет'}</Descriptions.Item>
                      <Descriptions.Item label="Комментарий" span={2}>
                        {animal.comment || '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Архив" span={2}>
                        {animal.archivedAt
                          ? `${formatDateTime(animal.archivedAt)} · ${animal.archiveReason ? animalArchiveReasonLabels[animal.archiveReason] : 'причина не указана'}${animal.archiveComment ? ` · ${animal.archiveComment}` : ''}`
                          : 'Активная карточка'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'weights',
                  label: 'Вес',
                  children: <AnimalWeightsTab animalId={animal.id} readOnly={Boolean(animal.archivedAt)} />,
                },
                {
                  key: 'vaccinations',
                  label: 'Вакцинации',
                  children: <AnimalVaccinationsTab animalId={animal.id} readOnly={Boolean(animal.archivedAt)} />,
                },
                {
                  key: 'tasks',
                  label: 'Задачи',
                  children: <AnimalTasksTab ownerId={animal.ownerId} animalId={animal.id} readOnly={Boolean(animal.archivedAt)} />,
                },
                {
                  key: 'archive',
                  label: 'Архив документов',
                  children: (
                    <PatientDocumentArchive
                      animalId={animal.id}
                      canManage={!animal.archivedAt && hasPermission(auth?.employee, 'documents.manage')}
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </div>
      </main>
      <AnimalFormDrawer
        open={editOpen}
        title="Редактировать пациента"
        initialAnimal={animal}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
      <AnimalArchiveModal
        open={archiveOpen}
        animal={animal ?? null}
        loading={archiveMutation.isPending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={(input) => archiveMutation.mutate(input)}
      />
      <Modal
        title="Изменить кличку пациента"
        open={renameOpen}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={renameMutation.isPending}
        okButtonProps={{ disabled: !nickname.trim() || nickname.trim() === animal?.nickname || nickname.trim().length > 120 }}
        onCancel={() => setRenameOpen(false)}
        onOk={() => renameMutation.mutate(nickname)}
      >
        <Typography.Paragraph type="secondary">
          Новая кличка появится в карточке пациента, приёмах и печатных документах. Изменение сохранится в журнале аудита.
        </Typography.Paragraph>
        <Input
          value={nickname}
          maxLength={120}
          showCount
          autoFocus
          placeholder="Кличка пациента"
          onChange={(event) => setNickname(event.target.value)}
          onPressEnter={() => {
            if (nickname.trim() && nickname.trim() !== animal?.nickname) renameMutation.mutate(nickname);
          }}
        />
      </Modal>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="context-row">
      <span>{label}</span>
      <span>{value === undefined || value === null || value === '' ? '—' : value}</span>
    </div>
  );
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};

function getLatestVaccination(vaccinations?: Vaccination[]) {
  return [...(vaccinations ?? [])]
    .filter((vaccination) => vaccination.vaccinatedAt)
    .sort((left, right) => new Date(right.vaccinatedAt!).getTime() - new Date(left.vaccinatedAt!).getTime())[0];
}

function getNextRevaccination(vaccinations?: Vaccination[]) {
  const now = Date.now();
  const sorted = [...(vaccinations ?? [])]
    .filter((vaccination) => vaccination.expiresAt)
    .sort((left, right) => new Date(left.expiresAt!).getTime() - new Date(right.expiresAt!).getTime());

  return sorted.find((vaccination) => new Date(vaccination.expiresAt!).getTime() >= now) ?? sorted.at(-1);
}

function vaccinationLabel(vaccination: Vaccination) {
  return `${vaccination.title} · ${formatRuDate(vaccination.vaccinatedAt)}`;
}

function RevaccinationValue({ vaccination }: { vaccination?: Vaccination }) {
  if (!vaccination?.expiresAt) {
    return <>—</>;
  }

  const timeLeft = new Date(vaccination.expiresAt).getTime() - Date.now();
  const isOverdue = timeLeft < 0;
  const isSoon = timeLeft <= 30 * 24 * 60 * 60 * 1000;

  return (
    <span className="inline-status">
      <Tag color={isOverdue ? 'red' : isSoon ? 'gold' : 'green'}>
        {isOverdue ? `просрочено ${formatRuDate(vaccination.expiresAt)}` : formatRuDate(vaccination.expiresAt)}
      </Tag>
      {vaccination.title}
    </span>
  );
}
