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
        title="Система и резервные копии"
        description="Состояние CRM, защита данных и безопасные обновления программы."
      />

      <Space direction="vertical" size={16} className="full-width">
        <Card title="Состояние связи">
          <SystemStatus />
        </Card>

        <Card
          title={
            <Space>
              <SafetyOutlined />
              Автоматические резервные копии
            </Space>
          }
        >
          <Space direction="vertical" size={14} className="full-width">
            <Alert
              type="info"
              showIcon
              message="Автоматическое создание резервных копий настроено"
              description="CRM сохраняет базу и файлы клиники без участия сотрудника. Ниже указан заданный режим хранения."
            />
            <Descriptions bordered column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="Интервал">
                <Tag color="green">каждые {backupIntervalHours} часов</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Хранение">
                <Tag>{backupRetentionDays} дней</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Место хранения">Папка резервных копий на сервере</Descriptions.Item>
              <Descriptions.Item label="Контроль копий">Требуется периодическая проверка восстановления</Descriptions.Item>
              <Descriptions.Item label="Содержимое архива">
                База данных, документы и локальные файлы клиники.
              </Descriptions.Item>
            </Descriptions>
            <Typography.Text type="secondary">
              Архивы старше срока хранения удаляются автоматически. Для защиты от поломки компьютера нужна дополнительная копия на отдельном диске.
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
            <Descriptions.Item label="Перед обновлением">создаётся резервная копия базы</Descriptions.Item>
            <Descriptions.Item label="Windows">Обновить TemichevVet - Windows.bat</Descriptions.Item>
            <Descriptions.Item label="Mac">Обновить TemichevVet - Mac.command</Descriptions.Item>
            <Descriptions.Item label="Linux">Обновить TemichevVet - Linux.sh</Descriptions.Item>
            <Descriptions.Item label="Что обновляется">
              Программа TemichevVet. Настройки, клиенты, пациенты, приёмы, счета и документы сохраняются.
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <details className="technical-card-details">
          <summary>
            <DatabaseOutlined />
            Техническая информация
          </summary>
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
