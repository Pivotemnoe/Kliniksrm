import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Descriptions, Empty, Form, Input, List, Space, Switch, Tag, Typography } from 'antd';
import { useEffect } from 'react';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { generateDirectorBriefing, getDirectorBriefingSettings, listDirectorBriefings, updateDirectorBriefingSettings } from './business.api';
import type { DirectorBriefing } from './types';

type SettingsForm = { enabled: boolean; time: string; timezone: string };

export function DirectorBriefingTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SettingsForm>();
  const settingsQuery = useQuery({ queryKey: ['director-briefing', 'settings'], queryFn: getDirectorBriefingSettings });
  const briefingsQuery = useQuery({ queryKey: ['director-briefing', 'list'], queryFn: listDirectorBriefings });
  useEffect(() => {
    if (!settingsQuery.data) return;
    form.setFieldsValue({
      enabled: settingsQuery.data.directorBriefingEnabled,
      time: settingsQuery.data.directorBriefingTime,
      timezone: settingsQuery.data.directorBriefingTimezone,
    });
  }, [form, settingsQuery.data]);

  const settingsMutation = useMutation({
    mutationFn: updateDirectorBriefingSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['director-briefing', 'settings'] });
      message.success('Расписание сводки сохранено');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const generateMutation = useMutation({
    mutationFn: generateDirectorBriefing,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['director-briefing', 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['staff-alerts'] }),
      ]);
      message.success('Сводка сформирована по актуальным данным');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <div className="director-briefing-layout">
      <Card title="Расписание ежедневной сводки">
        <Alert
          type="info"
          showIcon
          message="Только факты из CRM"
          description="Сводка ничего не исправляет и не закрывает автоматически. Она показывает подтверждаемые показатели, риски и операции, требующие внимания директора."
          style={{ marginBottom: 18 }}
        />
        <Form<SettingsForm>
          form={form}
          layout="vertical"
          initialValues={{ enabled: true, time: '08:00', timezone: 'Europe/Moscow' }}
          onFinish={(values) => settingsMutation.mutate(values)}
        >
          <Form.Item name="enabled" label="Автоматическое формирование" valuePropName="checked">
            <Switch checkedChildren="Включено" unCheckedChildren="Выключено" />
          </Form.Item>
          <Form.Item name="time" label="Время формирования" rules={[{ required: true }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Укажите время в формате ЧЧ:ММ' }]}>
            <Input type="time" style={{ maxWidth: 180 }} />
          </Form.Item>
          <Form.Item name="timezone" label="Часовой пояс" rules={[{ required: true }]}>
            <Input style={{ maxWidth: 320 }} />
          </Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={settingsMutation.isPending}>Сохранить расписание</Button>
            <Button icon={<ReloadOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>Сформировать сейчас</Button>
          </Space>
        </Form>
      </Card>
      <Card title="Последние сводки">
        {briefingsQuery.error ? <Alert type="error" showIcon message="Не удалось загрузить сводки" description={getErrorMessage(briefingsQuery.error)} /> : null}
        <List
          loading={briefingsQuery.isLoading}
          dataSource={briefingsQuery.data ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Сводок пока нет. Нажмите «Сформировать сейчас»." /> }}
          renderItem={(briefing) => <BriefingItem briefing={briefing} />}
        />
      </Card>
    </div>
  );
}

function BriefingItem({ briefing }: { briefing: DirectorBriefing }) {
  const snapshot = briefing.snapshot;
  return (
    <List.Item>
      <Card size="small" style={{ width: '100%' }}>
        <Space wrap style={{ marginBottom: 10 }}>
          <Typography.Text strong>{briefing.title}</Typography.Text>
          <Tag color={briefing.trigger === 'MANUAL' ? 'blue' : 'green'}>{briefing.trigger === 'MANUAL' ? 'Сформирована вручную' : 'Автоматическая'}</Tag>
          <Typography.Text type="secondary">{formatDateTime(briefing.createdAt)}</Typography.Text>
        </Space>
        <Descriptions size="small" column={{ xs: 1, sm: 2, xl: 4 }} bordered items={[
          { key: 'visits', label: 'Приёмы / владельцы', children: `${snapshot.visits.total} / ${snapshot.visits.uniqueOwners}, завершено ${snapshot.visits.completed}` },
          { key: 'appointments', label: 'Записи', children: `${snapshot.appointments.total}, не пришли ${snapshot.appointments.noShow}` },
          { key: 'finance', label: 'Счета / оплаты', children: `${money(snapshot.finance.billed)} / ${money(snapshot.finance.paid)}` },
          { key: 'manualRevenue', label: 'Ручная выручка', children: money(snapshot.finance.manualRevenue) },
          { key: 'debts', label: 'Долги клиентов / поставщикам', children: `${money(snapshot.finance.debtorsAmount)} / ${money(snapshot.finance.supplierPayable)}` },
          { key: 'control', label: 'На проверке', children: `${snapshot.control.unresolvedEntries + snapshot.control.submittedCloses}` },
          { key: 'vaccinations', label: 'Вакцинации', children: `сегодня ${snapshot.vaccinations.today}, просрочено ${snapshot.vaccinations.overdue}` },
          { key: 'unfinished', label: 'Незавершённые > 1 ч', children: snapshot.visits.unfinishedOverHour },
          { key: 'stock', label: 'Низкие остатки', children: snapshot.stock.lowStock },
          { key: 'laboratory', label: 'Лаборатория', children: `назначено ${snapshot.laboratory.ordered}, открыто сейчас ${snapshot.laboratory.openNow}` },
          { key: 'documents', label: 'Документы', children: `сформировано ${snapshot.documents.generated}` },
        ]} />
        <Typography.Paragraph style={{ whiteSpace: 'pre-line', margin: '14px 0 0' }}>{briefing.summary}</Typography.Paragraph>
      </Card>
    </List.Item>
  );
}

function money(value: number) {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}
