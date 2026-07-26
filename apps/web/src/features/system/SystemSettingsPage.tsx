import { CheckCircleOutlined, CloudSyncOutlined, DatabaseOutlined, SafetyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { PageHeader } from '../../shared/ui/PageHeader';
import { getBackupStatus } from './system.api';
import { SystemStatus } from './SystemStatus';

export function SystemSettingsPage() {
  const backupQuery = useQuery({
    queryKey: ['system', 'backups'],
    queryFn: getBackupStatus,
    refetchInterval: 60_000,
    retry: false,
  });
  const backup = backupQuery.data;

  return (
    <div className="page">
      <PageHeader title="Система и резервные копии" description="Состояние CRM, защита данных и безопасные обновления программы." />
      <Space direction="vertical" size={16} className="full-width">
        <Card title="Состояние связи"><SystemStatus /></Card>

        <Card title={<Space><SafetyOutlined />Резервные копии</Space>}>
          <Space direction="vertical" size={14} className="full-width">
            {backupQuery.isPending ? (
              <Alert type="info" showIcon message="Проверяем резервные копии" description="Получаем свежий отчёт службы резервирования." />
            ) : backupQuery.isError ? (
              <Alert type="warning" showIcon message="Статус резервных копий пока недоступен" description="Программа работает, но отчёт службы резервирования не получен. Проверьте его перед переносом компьютера или обновлением." />
            ) : backup?.warnings.length ? (
              <Alert type="warning" showIcon message="Резервные копии требуют внимания" description={backup.warnings.join('. ')} />
            ) : (
              <Alert type="success" showIcon message="Резервные копии в норме" description="Свежая копия базы найдена, свободного места достаточно." />
            )}
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="База данных"><Tag color="green">{backup?.schedule.database ?? 'ежедневно'}</Tag></Descriptions.Item>
              <Descriptions.Item label="Документы и фотографии"><Tag>{backup?.schedule.files ?? 'еженедельно'}</Tag></Descriptions.Item>
              <Descriptions.Item label="Последняя копия базы">{formatDate(backup?.lastDatabaseBackupAt)}</Descriptions.Item>
              <Descriptions.Item label="Последняя копия файлов">{formatDate(backup?.lastFilesBackupAt)}</Descriptions.Item>
              <Descriptions.Item label="Место хранения">{backup?.storage ?? 'Проверяется'}</Descriptions.Item>
              <Descriptions.Item label="Свободно">{formatBytes(backup?.freeBytes)}</Descriptions.Item>
              <Descriptions.Item label="Проверка целостности">{formatDate(backup?.lastIntegrityCheckAt)}</Descriptions.Item>
              <Descriptions.Item label="Проверка восстановления">
                {backup?.lastRestoreTestAt
                  ? <Tag color={backup.lastRestoreTestState === 'ok' ? 'green' : 'red'}>{backup.lastRestoreTestState === 'ok' ? 'Пройдена' : 'Ошибка'} · {formatDate(backup.lastRestoreTestAt)}</Tag>
                  : <Tag color="orange">Ещё не выполнялась</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Хранение базы">
                {backup ? `${backup.schedule.dailyRetentionDays} дней ежедневно, ${backup.schedule.weeklyRetentionDays} дней еженедельно, ${backup.schedule.monthlyRetentionDays} дней ежемесячно` : 'Проверяется'}
              </Descriptions.Item>
              <Descriptions.Item label="Размер последней копии">
                База: {formatBytes(backup?.databaseBytes)}, файлы: {formatBytes(backup?.filesBytes)}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Text type="secondary">
              Для защиты от поломки серверного компьютера укажите в настройках папку на отдельном физическом диске. Проверка восстановления запускается отдельной безопасной кнопкой на сервере и использует временную базу.
            </Typography.Text>
          </Space>
        </Card>

        <Card title={<Space><CloudSyncOutlined />Безопасные обновления</Space>}>
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Перед обновлением"><Space><CheckCircleOutlined className="success-icon" />резервная копия и снимок настроек</Space></Descriptions.Item>
            <Descriptions.Item label="Проверки">архитектура Windows, свободное место, состав миграций</Descriptions.Item>
            <Descriptions.Item label="Windows">Обновить TemichevVet - Windows.bat</Descriptions.Item>
            <Descriptions.Item label="Журнал">версия до и после обновления записывается автоматически</Descriptions.Item>
            <Descriptions.Item label="Если запуск не удался">возвращаются предыдущие образы программы</Descriptions.Item>
            <Descriptions.Item label="Что сохраняется">настройки, клиенты, пациенты, приёмы, счета, документы и Docker volumes</Descriptions.Item>
          </Descriptions>
          <Alert
            type="info"
            showIcon
            message="База данных назад автоматически не откатывается"
            description="Это защищает новые клинические данные. При сбое возвращается только предыдущая версия приложения; восстановление базы выполняется отдельно и только по явному подтверждению."
            style={{ marginTop: 14 }}
          />
        </Card>

        <Card title="Перенос на новый компьютер">
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="1">На старом сервере: «Создать комплект переноса»</Descriptions.Item>
            <Descriptions.Item label="2">Скопировать архив и файл контрольной суммы на отдельный диск</Descriptions.Item>
            <Descriptions.Item label="3">На новом сервере: установить TemichevVet без тестовых данных</Descriptions.Item>
            <Descriptions.Item label="4">Запустить «Восстановить на новом компьютере» и ввести точное подтверждение</Descriptions.Item>
            <Descriptions.Item label="5">Сравнить контрольные количества и открыть реальные карточки</Descriptions.Item>
            <Descriptions.Item label="6">Старый компьютер не очищать до приёмки нового</Descriptions.Item>
          </Descriptions>
        </Card>

        <details className="technical-card-details">
          <summary><DatabaseOutlined />Техническая информация</summary>
          <Card>
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="CRM">clinic-crm-web</Descriptions.Item>
              <Descriptions.Item label="API">clinic-crm-api</Descriptions.Item>
              <Descriptions.Item label="База данных">clinic-crm-postgres</Descriptions.Item>
              <Descriptions.Item label="Резервные копии">clinic-crm-backup</Descriptions.Item>
              <Descriptions.Item label="Файлы">clinic-crm-minio</Descriptions.Item>
              <Descriptions.Item label="Очередь задач">clinic-crm-redis</Descriptions.Item>
            </Descriptions>
          </Card>
        </details>
      </Space>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value?: number | null) {
  if (value === null || value === undefined) return 'Нет данных';
  if (value < 1024 ** 2) return `${Math.round(value / 1024)} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} МБ`;
  return `${(value / 1024 ** 3).toFixed(1)} ГБ`;
}
