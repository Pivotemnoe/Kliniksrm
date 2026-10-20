import { Alert, Collapse, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { formatDateTime } from '../../shared/utils/date';
import type { AvitoOverview } from './avito.api';
import '../../shared/ui/module-ui.css';

export function AvitoStatusPanel({ overview, modeLabel }: { overview: AvitoOverview; modeLabel: string }) {
  const warnings = [
    ...(overview.referenceData?.stale ? ['Прайс CRM нужно обновить'] : []),
    ...(overview.referenceData?.inventoryStale ? ['Наличие вакцин нужно обновить'] : []),
    ...(overview.health?.uncertain ? [`Отправок с неопределённым результатом: ${overview.health.uncertain}`] : []),
    ...(overview.health?.failedEvents ? [`Событий после неудачных повторов: ${overview.health.failedEvents}`] : []),
    ...(overview.connection.error ? [overview.connection.error] : []),
  ];
  const details = [
    ...(overview.runtime.localReadOnly ? [{ key: 'local', title: 'Локальный просмотр', text: 'Объявления и переписка читаются из Авито по кнопке загрузки. Ответы клиентам и публикации выключены. ИИ проверяется только в сценариях директора и при подготовке черновиков.' }] : []),
    ...(overview.runtime.pilotRestricted ? [{ key: 'pilot', title: 'Контрольный запуск Авито', text: 'Ответы и создание заявок разрешены только в выбранном тестовом диалоге. Остальную переписку продолжает сотрудник.' }] : []),
    ...(overview.referenceData ? [{ key: 'reference', title: 'Справочники CRM', text: `Услуг: ${overview.referenceData.services}. Филиалов: ${overview.referenceData.offices}. Вакцин: ${overview.referenceData.vaccineProducts ?? 0}. Получено: ${formatDateTime(overview.referenceData.capturedAt)}. Прайс действителен сутки, наличие вакцин — 15 минут. Заявки сохраняются в локальной базе.` }] : []),
    ...(!overview.runtime.languageModelConfigured ? [{ key: 'model', title: 'ИИ Авито ещё не включён в этой установке', text: 'Доступны утверждённые сценарии и сведения CRM; платные вызовы модели не выполняются.' }] : []),
    ...(!overview.runtime.liveSendEnabled ? [{ key: 'send', title: 'Отправка клиентам выключена', text: 'Можно подготовить правила и проверить сценарии. Клиентам ничего не отправляется до отдельного включения на сервере.' }] : []),
  ];
  return <section className="module-status-panel" aria-label="Состояние модуля Авито">
    <div className="module-status-summary">
      {warnings.length ? <WarningOutlined aria-hidden /> : <CheckCircleOutlined aria-hidden />}
      <strong>Авито</strong>
      <Tag color={overview.installation.enabled ? 'green' : 'default'}>{overview.installation.enabled ? 'Модуль подключён' : 'Модуль отключён'}</Tag>
      <Tag color="blue">{modeLabel}</Tag>
      <Tag color={overview.runtime.liveSendEnabled ? 'gold' : 'default'}>{overview.runtime.liveSendEnabled ? 'Отправка клиентам включена' : 'Отправка клиентам выключена'}</Tag>
      {overview.runtime.pilotRestricted && <Tag color="gold">Только тестовый диалог</Tag>}
      {overview.connection.accountName && <Typography.Text type="secondary">{overview.connection.accountName}</Typography.Text>}
    </div>
    {warnings.length > 0 && <Alert type="warning" showIcon message="Требует внимания" description={<Space direction="vertical" size={2}>{warnings.map(text => <span key={text}>{text}</span>)}</Space>} />}
    {details.length > 0 && <Collapse ghost className="module-status-details" items={[{
      key: 'details', label: `Подключение и диагностика · ${details.length}`,
      children: <div className="module-status-detail-list">{details.map(detail => <div key={detail.key}><Typography.Text strong>{detail.title}</Typography.Text><Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>{detail.text}</Typography.Paragraph></div>)}</div>,
    }]} />}
  </section>;
}
