import { EditOutlined, LeftOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Tabs, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatAnimalBirthDateDisplay } from '../../shared/utils/animalBirthDate';
import { formatDate as formatRuDate, formatDateTime } from '../../shared/utils/date';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { listVisits } from '../visits/visits.api';
import { visitStatusColors, visitStatusLabels } from '../visits/types';
import { AnimalFormDrawer } from './AnimalFormDrawer';
import { AnimalTasksTab } from './AnimalTasksTab';
import { AnimalVisitsTab } from './AnimalVisitsTab';
import { AnimalVaccinationsTab } from './AnimalVaccinationsTab';
import { AnimalWeightsTab } from './AnimalWeightsTab';
import { getAnimal, updateAnimal } from './animals.api';
import { AnimalMutationInput, Vaccination } from './types';

export function AnimalCardPage() {
  const { animalId } = useParams<{ animalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
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
  const animal = animalQuery.data;
  const visits = visitsSummaryQuery.data?.items ?? [];
  const latestVisit = visits[0];
  const diagnosisCount = visits.reduce((sum, visit) => sum + (visit._count?.diagnoses ?? 0), 0);
  const latestWeight = animal?.weights?.[0];
  const latestVaccination = getLatestVaccination(animal?.vaccinations);
  const nextRevaccination = getNextRevaccination(animal?.vaccinations);

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
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Профиль</strong>
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={!animal}>
              профиль
            </Button>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="№ пациента" value={animal?.id} />
            <ContextRow label="Вид" value={<AnimalSpeciesLabel species={animal?.species} />} />
            <ContextRow label="Порода" value={animal?.breed} />
            <ContextRow label="Пол" value={animal ? sexLabel[animal.sex] : undefined} />
            <ContextRow label="Возраст" value={getAgeLabel(animal?.birthDate)} />
            <ContextRow label="Стерилизация" value={animal?.isSterilized ? 'Да' : 'Нет'} />
            <ContextRow label="Статус" value={animal?.status} />
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
      </aside>
      <main className="work-area">
        <div className="work-surface">
          {animal ? (
            <Tabs
              items={[
                {
                  key: 'visits',
                  label: 'Приёмы',
                  children: <AnimalVisitsTab ownerId={animal.ownerId} animalId={animal.id} />,
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
                      <Descriptions.Item label="Дата рождения">{formatAnimalBirthDateDisplay(animal.birthDate)}</Descriptions.Item>
                      <Descriptions.Item label="Окрас">{animal.color || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Микрочип">{animal.microchip || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Клеймо">{animal.mark || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Статус">{animal.status || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Стерилизация">{animal.isSterilized ? 'Да' : 'Нет'}</Descriptions.Item>
                      <Descriptions.Item label="Избранный">{animal.isFavorite ? 'Да' : 'Нет'}</Descriptions.Item>
                      <Descriptions.Item label="Комментарий" span={2}>
                        {animal.comment || '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'weights',
                  label: 'Вес',
                  children: <AnimalWeightsTab animalId={animal.id} />,
                },
                {
                  key: 'vaccinations',
                  label: 'Вакцинации',
                  children: <AnimalVaccinationsTab animalId={animal.id} />,
                },
                {
                  key: 'tasks',
                  label: 'Задачи',
                  children: <AnimalTasksTab ownerId={animal.ownerId} animalId={animal.id} />,
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

function getAgeLabel(value?: string | null) {
  if (!value) {
    return '—';
  }

  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) {
    return '—';
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  birthDate.setHours(0, 0, 0, 0);

  if (birthDate > now) {
    return '—';
  }

  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();
  let days = now.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0) {
    return [formatAgePart(years, 'год', 'года', 'лет'), months > 0 ? formatAgePart(months, 'месяц', 'месяца', 'месяцев') : null]
      .filter(Boolean)
      .join(' ');
  }

  if (months > 0) {
    return [formatAgePart(months, 'месяц', 'месяца', 'месяцев'), days > 0 ? formatAgePart(days, 'день', 'дня', 'дней') : null]
      .filter(Boolean)
      .join(' ');
  }

  return formatAgePart(days, 'день', 'дня', 'дней');
}

function formatAgePart(value: number, one: string, few: string, many: string) {
  const lastDigit = value % 10;
  const lastTwoDigits = value % 100;
  const label = lastDigit === 1 && lastTwoDigits !== 11 ? one : lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14) ? few : many;
  return `${value} ${label}`;
}

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
