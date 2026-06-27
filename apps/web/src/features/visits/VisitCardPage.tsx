import { CheckOutlined, CloseOutlined, FileTextOutlined, LeftOutlined, PlayCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Space, Tabs, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import type { Employee } from '../../shared/types/auth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { VisitDocumentsTab } from './VisitDocumentsTab';
import { VisitExamTab } from './VisitExamTab';
import { VisitHistoryTab } from './VisitHistoryTab';
import { VisitHospitalTab } from './VisitHospitalTab';
import { VisitLaboratoryTab } from './VisitLaboratoryTab';
import { VisitRecommendationTab } from './VisitRecommendationTab';
import { VisitServicesTab } from './VisitServicesTab';
import { cancelVisit, completeVisit, getVisit, startVisit } from './visits.api';
import { Visit, visitStatusColors, visitStatusLabels } from './types';
import { printVisitRecommendation, printVisitSheet } from './visitPrint';

export function VisitCardPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'visits.manage');
  const canReadBilling = hasPermission(auth?.employee, 'billing.read');
  const visitQuery = useQuery({
    queryKey: ['visits', visitId],
    queryFn: () => getVisit(visitId!),
    enabled: Boolean(visitId),
  });
  const actionMutation = useMutation({
    mutationFn: (action: 'start' | 'complete' | 'cancel') => {
      if (action === 'start') {
        return startVisit(visitId!);
      }

      if (action === 'complete') {
        return completeVisit(visitId!);
      }

      return cancelVisit(visitId!);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visitId] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
      ]);
      message.success('Статус приёма обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const visit = visitQuery.data;
  const locked = visit ? isVisitLockedForEditing(visit, auth?.employee) : false;
  const completedEditNotice = visit ? getCompletedEditNotice(visit, auth?.employee, locked) : null;
  const latestWeight = visit?.animal.weights?.[0];
  const latestVaccination = getLatestVaccination(visit?.animal.vaccinations);
  const nextRevaccination = getNextRevaccination(visit?.animal.vaccinations);

  if (visitQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Приём" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(visitQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="workbench">
      <aside className="context-panel">
        <div className="context-section">
          <div className="context-section-header">
            <button className="table-link" type="button" onClick={() => navigate('/visits')}>
              <LeftOutlined /> К приёмам
            </button>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Дата" value={formatDateTime(visit?.startedAt)} />
            <ContextRow
              label="Статус"
              value={visit ? <Tag color={visitStatusColors[visit.status]}>{visitStatusLabels[visit.status]}</Tag> : undefined}
            />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Стоимость</strong>
          </div>
          <div className="context-section-body">
            <div className="visit-sidebar-total">{visit ? formatMoney(visit.totalAmount) : '—'}</div>
            <Typography.Text type="secondary">
              {visit?.bill ? `Оплачено ${formatMoney(visit.bill.paidAmount)}` : 'Нет товаров и услуг'}
            </Typography.Text>
            {visit?.bill && canReadBilling ? (
              <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/bills/${visit.bill?.id}`)}>
                Открыть счёт
              </Button>
            ) : null}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>{visit?.animal.nickname ?? 'Пациент'}</strong>
            {visit ? (
              <Button size="small" type="link" onClick={() => navigate(`/patients/${visit.animalId}`)}>
                профиль
              </Button>
            ) : null}
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Вид" value={<AnimalSpeciesLabel species={visit?.animal.species} />} />
            <ContextRow label="Порода" value={visit?.animal.breed} />
            <ContextRow label="Пол" value={visit ? sexLabel[visit.animal.sex] : undefined} />
            <ContextRow label="Статус" value={visit?.animal.status} />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Клинически</strong>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow
              label="Вес"
              value={
                visit?.exam?.weightKg
                  ? `${visit.exam.weightKg} кг · осмотр`
                  : latestWeight
                    ? `${latestWeight.weightKg} кг · ${formatDate(latestWeight.measuredAt)}`
                    : '—'
              }
            />
            <ContextRow label="Температура" value={visit?.exam?.temperatureC ? `${visit.exam.temperatureC} °C` : '—'} />
            <ContextRow
              label="Диагнозы"
              value={
                visit?.diagnoses.length ? (
                  <span className="context-tag-list">
                    {visit.diagnoses.map((diagnosis) => (
                      <Tag key={diagnosis.id}>{diagnosis.title}</Tag>
                    ))}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <ContextRow label="Вакцина" value={latestVaccination ? vaccinationLabel(latestVaccination) : '—'} />
            <ContextRow label="Ревакцинация" value={<RevaccinationValue vaccination={nextRevaccination} />} />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Владелец</strong>
          </div>
          <div className="context-section-body">
            {visit ? (
              <Typography.Link onClick={() => navigate(`/owners/${visit.ownerId}`)}>{visit.owner.fullName}</Typography.Link>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Исполнитель</strong>
          </div>
          <div className="context-section-body">{visit?.employee?.fullName ?? '—'}</div>
        </div>
        {visit ? (
          <div className="context-section">
            <div className="context-section-header">
              <strong>Печать</strong>
            </div>
            <div className="context-section-body">
              <Space wrap>
                <Button icon={<PrinterOutlined />} onClick={() => printVisitSheet(visit)}>
                  Лист приёма
                </Button>
                <Button icon={<PrinterOutlined />} onClick={() => printVisitRecommendation(visit)}>
                  Лист назначений
                </Button>
              </Space>
            </div>
          </div>
        ) : null}
        {canManage && visit ? (
          <div className="context-section">
            <div className="context-section-body">
              <Space wrap>
                {visit.status === 'DRAFT' ? (
                  <Button icon={<PlayCircleOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('start')}>
                    В работе
                  </Button>
                ) : null}
                {visit.status === 'IN_PROGRESS' ? (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={actionMutation.isPending}
                    onClick={() => actionMutation.mutate('complete')}
                  >
                    Завершить
                  </Button>
                ) : null}
                {visit.status === 'DRAFT' || visit.status === 'IN_PROGRESS' ? (
                  <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                    Отменить
                  </Button>
                ) : null}
              </Space>
            </div>
          </div>
        ) : null}
      </aside>
      <main className="work-area visit-work-area">
        <div className="work-surface">
          {visit ? (
            <>
              {completedEditNotice ? <Alert type="info" showIcon message={completedEditNotice} className="form-alert" /> : null}
              <Tabs
                items={[
                  {
                    key: 'exam',
                    label: 'Лист осмотра',
                    children: <VisitExamTab visit={visit} canManage={canManage} locked={Boolean(locked)} />,
                  },
                {
                  key: 'recommendation',
                  label: 'Рекомендации',
                  children: <VisitRecommendationTab visit={visit} canManage={canManage} locked={Boolean(locked)} />,
                },
                {
                  key: 'services',
                  label: 'Товары и услуги',
                  children: <VisitServicesTab visit={visit} canManage={canManage} locked={Boolean(locked)} />,
                },
                {
                  key: 'laboratory',
                  label: 'Лаборатория',
                  children: <VisitLaboratoryTab visit={visit} canManage={canManage} locked={Boolean(locked)} />,
                },
                {
                  key: 'history',
                  label: 'История болезни',
                  children: <VisitHistoryTab visit={visit} />,
                },
                {
                  key: 'documents',
                  label: 'Документы',
                  children: <VisitDocumentsTab visit={visit} locked={Boolean(locked)} />,
                },
                {
                  key: 'hospital',
                  label: 'Стационар',
                  children: <VisitHospitalTab visit={visit} locked={Boolean(locked)} />,
                },
                {
                  key: 'profile',
                  label: 'Основное',
                  children: (
                    <Descriptions bordered column={{ xs: 1, md: 2 }}>
                      <Descriptions.Item label="Источник">
                        {visit.appointment ? (
                          <Typography.Link onClick={() => navigate(`/schedule/${visit.appointmentId}`)}>Запись на приём</Typography.Link>
                        ) : visit.queueEntry ? (
                          <Typography.Link onClick={() => navigate(`/queue/${visit.queueEntryId}`)}>Электронная очередь</Typography.Link>
                        ) : (
                          'Прямой приём'
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="Кабинет/стационар">{visit.hospitalBox?.name ?? visit.hospitalBox?.title ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Начат">{formatDateTime(visit.startedAt)}</Descriptions.Item>
                      <Descriptions.Item label="Завершён">{formatDateTime(visit.completedAt)}</Descriptions.Item>
                      <Descriptions.Item label="Счёт">
                        {visit.bill ? `${formatMoney(visit.bill.totalAmount)} / оплачено ${formatMoney(visit.bill.paidAmount)}` : '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
              ]}
            />
            </>
          ) : null}
        </div>
      </main>
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

const completedVisitEditGraceMs = 30 * 60 * 1000;

function isVisitLockedForEditing(visit: Visit, employee?: Employee) {
  if (visit.status === 'CANCELLED') {
    return true;
  }

  if (visit.status !== 'COMPLETED') {
    return false;
  }

  if (employee?.roles.includes('director')) {
    return false;
  }

  if (!visit.completedAt) {
    return true;
  }

  return Date.now() - new Date(visit.completedAt).getTime() > completedVisitEditGraceMs;
}

function getCompletedEditNotice(visit: Visit, employee: Employee | undefined, locked: boolean) {
  if (visit.status !== 'COMPLETED') {
    return null;
  }

  if (employee?.roles.includes('director')) {
    return 'Приём завершён, но открыт для редактирования директору.';
  }

  if (!locked) {
    return 'Приём завершён, но доступен для исправлений в течение 30 минут после завершения.';
  }

  return null;
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};

type VisitVaccination = NonNullable<Visit['animal']['vaccinations']>[number];

function getLatestVaccination(vaccinations?: VisitVaccination[]) {
  return [...(vaccinations ?? [])]
    .filter((vaccination) => vaccination.vaccinatedAt)
    .sort((left, right) => new Date(right.vaccinatedAt!).getTime() - new Date(left.vaccinatedAt!).getTime())[0];
}

function getNextRevaccination(vaccinations?: VisitVaccination[]) {
  const sorted = [...(vaccinations ?? [])]
    .filter((vaccination) => vaccination.expiresAt)
    .sort((left, right) => new Date(left.expiresAt!).getTime() - new Date(right.expiresAt!).getTime());

  return sorted.find((vaccination) => new Date(vaccination.expiresAt!).getTime() >= Date.now()) ?? sorted.at(-1);
}

function vaccinationLabel(vaccination: VisitVaccination) {
  return `${vaccination.title} · ${formatDate(vaccination.vaccinatedAt)}`;
}

function RevaccinationValue({ vaccination }: { vaccination?: VisitVaccination }) {
  if (!vaccination?.expiresAt) {
    return <>—</>;
  }

  const timeLeft = new Date(vaccination.expiresAt).getTime() - Date.now();
  const isOverdue = timeLeft < 0;
  const isSoon = timeLeft <= 30 * 24 * 60 * 60 * 1000;

  return (
    <span className="inline-status">
      <Tag color={isOverdue ? 'red' : isSoon ? 'gold' : 'green'}>
        {isOverdue ? `просрочено ${formatDate(vaccination.expiresAt)}` : formatDate(vaccination.expiresAt)}
      </Tag>
      {vaccination.title}
    </span>
  );
}
