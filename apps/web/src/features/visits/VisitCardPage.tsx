import { CheckOutlined, CloseOutlined, FileTextOutlined, HomeOutlined, LeftOutlined, PlayCircleOutlined, PrinterOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Input, Modal, Select, Space, Tabs, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import type { Employee } from '../../shared/types/auth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { AnimalStatusTag } from '../animals/animalStatus';
import { admitExistingHospitalStay, getHospitalResources } from '../hospital/hospital.api';
import { getOrganizationSettings } from '../organization/organization.api';
import { VisitDocumentsTab } from './VisitDocumentsTab';
import { VisitExamTab } from './VisitExamTab';
import { VisitHistoryTab } from './VisitHistoryTab';
import { VisitLaboratoryTab } from './VisitLaboratoryTab';
import { VisitRecommendationTab } from './VisitRecommendationTab';
import { VisitServicesTab } from './VisitServicesTab';
import { cancelVisit, completeVisit, getVisit, restoreVisit, startVisit } from './visits.api';
import { Visit, visitStatusColors, visitStatusLabels, visitTypeLabels } from './types';
import { printVisitRecommendation, printVisitSheet } from './visitPrint';

export function VisitCardPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'visits.manage');
  const canReadBilling = hasPermission(auth?.employee, 'billing.read');
  const canReadHospital = hasPermission(auth?.employee, 'hospital.read');
  const canManageHospital = hasPermission(auth?.employee, 'hospital.manage');
  const isDirector = Boolean(auth?.employee.roles.includes('director'));
  const [hospitalModalOpen, setHospitalModalOpen] = useState(false);
  const [hospitalBoxId, setHospitalBoxId] = useState<string>();
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreReason, setRestoreReason] = useState('');
  const visitQuery = useQuery({
    queryKey: ['visits', visitId],
    queryFn: () => getVisit(visitId!),
    enabled: Boolean(visitId),
  });
  const hospitalResourcesQuery = useQuery({
    queryKey: ['hospital', 'resources'],
    queryFn: getHospitalResources,
    enabled: canManageHospital,
  });
  const organizationQuery = useQuery({ queryKey: ['organization'], queryFn: getOrganizationSettings });
  const hospitalAdmissionMutation = useMutation({
    mutationFn: (boxId: string) => admitExistingHospitalStay(visitId!, { hospitalBoxId: boxId }),
    onSuccess: async (stay) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visitId] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['hospital'] }),
      ]);
      setHospitalModalOpen(false);
      setHospitalBoxId(undefined);
      message.success('Пациент помещён в стационар');
      navigate(`/hospital/${stay.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
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
  const restoreMutation = useMutation({
    mutationFn: () => restoreVisit(visitId!, restoreReason.trim()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visitId] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setRestoreModalOpen(false);
      setRestoreReason('');
      message.success('Приём возвращён в работу');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const visit = visitQuery.data;
  const primaryDiagnosisIssue = visit ? getPrimaryDiagnosisCompletionIssue(visit) : null;
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
      <nav className="visit-mobile-toolbar" aria-label="Быстрая навигация по приёму">
        <Button size="small" icon={<LeftOutlined />} onClick={() => navigate('/visits')}>
          Приёмы
        </Button>
        <Typography.Text strong ellipsis>{visit?.animal.nickname ?? 'Пациент'}</Typography.Text>
        <Button
          size="small"
          onClick={() => scrollToCrmSection('.visit-work-area')}
        >
          Осмотр
        </Button>
        <Button
          size="small"
          onClick={() => scrollToCrmSection('#visit-context-panel')}
        >
          Данные
        </Button>
      </nav>
      {canManage && visit ? (
        <div className="visit-mobile-status-actions">
          <Tag color={visitStatusColors[visit.status]}>{visitStatusLabels[visit.status]}</Tag>
          <Space wrap>
            {visit.status === 'DRAFT' ? (
              <Button icon={<PlayCircleOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('start')}>
                В работу
              </Button>
            ) : null}
            {visit.status === 'IN_PROGRESS' ? (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={actionMutation.isPending}
                onClick={() => {
                  if (primaryDiagnosisIssue) {
                    showDiagnosisWarning(modal, primaryDiagnosisIssue);
                    return;
                  }

                  actionMutation.mutate('complete');
                }}
              >
                Завершить
              </Button>
            ) : null}
            {visit.status === 'DRAFT' || visit.status === 'IN_PROGRESS' ? (
              <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                Отменить
              </Button>
            ) : null}
            {visit.status === 'CANCELLED' && isDirector ? (
              <Button icon={<UndoOutlined />} onClick={() => setRestoreModalOpen(true)}>
                Вернуть в работу
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}
      <aside className="context-panel" id="visit-context-panel">
        <div className="visit-mobile-return visit-mobile-return-top">
          <Button type="primary" onClick={() => scrollToCrmSection('.visit-work-area')}>
            Вернуться к осмотру
          </Button>
        </div>
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
            <ContextRow label="Возраст" value={formatAnimalAge(visit?.animal.birthDate)} />
            <ContextRow label="Состояние" value={visit ? <AnimalStatusTag status={visit.animal.status} /> : undefined} />
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
            <ContextRow label="Тип обращения" value={visit?.hospitalStay ? 'Поступление в стационар' : visit?.visitType ? visitTypeLabels[visit.visitType] : '—'} />
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
                <Button icon={<PrinterOutlined />} onClick={() => printVisitSheet(visit, organizationQuery.data)}>
                  Лист приёма
                </Button>
                <Button icon={<PrinterOutlined />} onClick={() => printVisitRecommendation(visit, undefined, organizationQuery.data)}>
                  Лист назначений
                </Button>
              </Space>
            </div>
          </div>
        ) : null}
        {visit && canReadHospital ? (
          <div className="context-section">
            <div className="context-section-header">
              <strong>Стационар</strong>
            </div>
            <div className="context-section-body">
              {visit.hospitalStay ? (
                <Button type="primary" icon={<HomeOutlined />} onClick={() => navigate(`/hospital/${visit.hospitalStay?.id}`)}>
                  Открыть карту стационара
                </Button>
              ) : canManageHospital && (visit.status === 'DRAFT' || visit.status === 'IN_PROGRESS') ? (
                <Button
                  icon={<HomeOutlined />}
                  onClick={() => {
                    if (primaryDiagnosisIssue) {
                      showDiagnosisWarning(modal, primaryDiagnosisIssue);
                      return;
                    }

                    setHospitalModalOpen(true);
                  }}
                >
                  Поместить в стационар
                </Button>
              ) : (
                <Typography.Text type="secondary">Пациент не находится в стационаре</Typography.Text>
              )}
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
                    onClick={() => {
                      if (primaryDiagnosisIssue) {
                        showDiagnosisWarning(modal, primaryDiagnosisIssue);
                        return;
                      }

                      actionMutation.mutate('complete');
                    }}
                  >
                    Завершить
                  </Button>
                ) : null}
                {visit.status === 'DRAFT' || visit.status === 'IN_PROGRESS' ? (
                  <Button danger icon={<CloseOutlined />} loading={actionMutation.isPending} onClick={() => actionMutation.mutate('cancel')}>
                    Отменить
                  </Button>
                ) : null}
                {visit.status === 'CANCELLED' && isDirector ? (
                  <Button icon={<UndoOutlined />} onClick={() => setRestoreModalOpen(true)}>
                    Вернуть в работу
                  </Button>
                ) : null}
              </Space>
            </div>
          </div>
        ) : null}
        <div className="visit-mobile-return">
          <Button type="primary" onClick={() => scrollToCrmSection('.visit-work-area')}>
            Вернуться к осмотру
          </Button>
        </div>
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
                  children: <VisitRecommendationTab visit={visit} canManage={canManage} locked={Boolean(locked)} organization={organizationQuery.data} />,
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
                      <Descriptions.Item label="Бокс стационара">{visit.hospitalStay?.hospitalBox?.name ?? visit.hospitalBox?.name ?? visit.hospitalBox?.title ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Тип обращения">{visit.hospitalStay ? 'Поступление в стационар' : visit.visitType ? visitTypeLabels[visit.visitType] : '—'}</Descriptions.Item>
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
      <Modal
        title="Вернуть отменённый приём в работу"
        open={restoreModalOpen}
        okText="Вернуть в работу"
        cancelText="Отмена"
        confirmLoading={restoreMutation.isPending}
        okButtonProps={{ disabled: restoreReason.trim().length < 3 }}
        onCancel={() => {
          setRestoreModalOpen(false);
          setRestoreReason('');
        }}
        onOk={() => restoreMutation.mutate()}
      >
        <Alert
          type="warning"
          showIcon
          className="form-alert"
          message="После восстановления снова можно менять финансовые позиции и лабораторные назначения"
          description="Действие и указанная причина сохранятся в аудите. Существующий отменённый счёт будет открыт повторно только если по нему не было оплаты."
        />
        <Typography.Paragraph>Укажите причину восстановления:</Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={restoreReason}
          maxLength={500}
          showCount
          placeholder="Например: приём отменили ошибочно"
          onChange={(event) => setRestoreReason(event.target.value)}
        />
      </Modal>
      <Modal
        title="Поместить пациента в стационар"
        open={hospitalModalOpen}
        okText="Поместить"
        cancelText="Отмена"
        confirmLoading={hospitalAdmissionMutation.isPending}
        okButtonProps={{ disabled: !hospitalBoxId }}
        onCancel={() => {
          setHospitalModalOpen(false);
          setHospitalBoxId(undefined);
        }}
        onOk={() => hospitalBoxId && hospitalAdmissionMutation.mutate(hospitalBoxId)}
      >
        <Typography.Paragraph type="secondary">
          Приём будет завершён, а наблюдения, температура, препараты и процедуры продолжатся независимо в отдельной карте стационара.
        </Typography.Paragraph>
        <Select
          value={hospitalBoxId}
          placeholder="Выберите свободный бокс"
          loading={hospitalResourcesQuery.isLoading}
          options={hospitalResourcesQuery.data?.boxes.map((box) => ({ value: box.id, label: box.name })) ?? []}
          onChange={setHospitalBoxId}
          className="full-width"
        />
      </Modal>
    </div>
  );
}

function scrollToCrmSection(selector: string) {
  const content = document.querySelector<HTMLElement>('.crm-content');
  const target = document.querySelector<HTMLElement>(selector);
  if (!content || !target) return;

  const alertsHeight = document.querySelector<HTMLElement>('.global-operational-alerts')?.getBoundingClientRect().height ?? 0;
  const contentTop = content.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top - contentTop + content.scrollTop;
  content.scrollTo({ top: Math.max(0, targetTop - alertsHeight - 8), behavior: 'smooth' });
}

function ContextRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="context-row">
      <span>{label}</span>
      <span>{value === undefined || value === null || value === '' ? '—' : value}</span>
    </div>
  );
}

function getPrimaryDiagnosisCompletionIssue(visit: Visit) {
  if (visit.visitType !== 'PRIMARY') {
    return null;
  }

  if (!visit.diagnoses.length) {
    return 'Вы не указали ни одного диагноза';
  }

  if (visit.diagnoses.some((diagnosis) => !diagnosis.diagnosisType?.trim())) {
    return 'Укажите тип для каждого диагноза';
  }

  return null;
}

function showDiagnosisWarning(modal: ReturnType<typeof App.useApp>['modal'], issue: string) {
  modal.warning({
    title: issue,
    content: 'Откройте «Лист осмотра», добавьте диагноз и выберите: предварительный, дифференциальный, клинический или окончательный.',
    okText: 'Понятно',
  });
}

const completedVisitEditGraceMs = 30 * 60 * 1000;

function isVisitLockedForEditing(visit: Visit, employee?: Employee) {
  if (employee?.roles.includes('director')) {
    return false;
  }

  if (visit.status === 'CANCELLED') {
    return true;
  }

  if (visit.status !== 'COMPLETED') {
    return false;
  }

  if (!visit.completedAt) {
    return true;
  }

  return Date.now() - new Date(visit.completedAt).getTime() > completedVisitEditGraceMs;
}

function getCompletedEditNotice(visit: Visit, employee: Employee | undefined, locked: boolean) {
  if (visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED') {
    return null;
  }

  if (employee?.roles.includes('director')) {
    return visit.status === 'CANCELLED'
      ? 'Приём отменён. Клиническая карта доступна директору для аудируемого исправления; товары, услуги и лаборатория — только после действия «Вернуть в работу».'
      : 'Приём завершён, но открыт директору для аудируемого исправления.';
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
