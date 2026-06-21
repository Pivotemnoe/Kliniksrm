import { CheckCircleOutlined, CloudSyncOutlined, DatabaseOutlined, SafetyOutlined } from '@ant-design/icons';
import { Alert, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { PageHeader } from '../../shared/ui/PageHeader';
import { SystemStatus } from './SystemStatus';

const backupIntervalHours = 5;
const backupRetentionDays = 14;

export function SystemSettingsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Система и backup"
        description="Контроль backend, базы данных, локальных обновлений и автоматических резервных копий."
      />

      <Space direction="vertical" size={16} className="full-width">
        <Card title="Состояние связи">
          <SystemStatus />
        </Card>

        <Card
          title={
            <Space>
              <SafetyOutlined />
              Автоматический backup
            </Space>
          }
        >
          <Space direction="vertical" size={14} className="full-width">
            <Alert
              type="success"
              showIcon
              message="Backup выполняется автоматически"
              description="Отдельный Docker-контейнер clinic-crm-backup создаёт архив без участия администратора, чтобы не зависеть от человеческого фактора."
            />
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Интервал">
                <Tag color="green">каждые {backupIntervalHours} часов</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Хранение">
                <Tag>{backupRetentionDays} дней</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Папка на сервере">backups</Descriptions.Item>
              <Descriptions.Item label="Контейнер">clinic-crm-backup</Descriptions.Item>
              <Descriptions.Item label="Содержимое архива" span={2}>
                PostgreSQL dump, данные Redis и локальные файлы MinIO.
              </Descriptions.Item>
            </Descriptions>
            <Typography.Text type="secondary">
              На сервере должно быть достаточно места на диске. Архивы старше срока хранения удаляются автоматически.
            </Typography.Text>
          </Space>
        </Card>

        <Card
          title={
            <Space>
              <CloudSyncOutlined />
              Обновления с флешки
            </Space>
          }
        >
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Безопасный режим">
              <Space>
                <CheckCircleOutlined className="success-icon" />
                данные клиники не удаляются
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Перед обновлением">создаётся backup базы</Descriptions.Item>
            <Descriptions.Item label="Windows">Обновить TemichevVet - Windows.bat</Descriptions.Item>
            <Descriptions.Item label="Mac">Обновить TemichevVet - Mac.command</Descriptions.Item>
            <Descriptions.Item label="Linux">Обновить TemichevVet - Linux.sh</Descriptions.Item>
            <Descriptions.Item label="Что обновляется" span={2}>
              код CRM и Docker-образы. Файл .env, Docker volumes, клиенты, пациенты, приёмы, счета и документы сохраняются.
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          title={
            <Space>
              <DatabaseOutlined />
              Что проверять на рабочем сервере
            </Space>
          }
        >
          <Descriptions bordered column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="CRM">clinic-crm-web</Descriptions.Item>
            <Descriptions.Item label="API">clinic-crm-api</Descriptions.Item>
            <Descriptions.Item label="База">clinic-crm-postgres</Descriptions.Item>
            <Descriptions.Item label="Backup">clinic-crm-backup</Descriptions.Item>
            <Descriptions.Item label="Файлы">clinic-crm-minio</Descriptions.Item>
            <Descriptions.Item label="Redis">clinic-crm-redis</Descriptions.Item>
          </Descriptions>
        </Card>
      </Space>
    </div>
  );
}
