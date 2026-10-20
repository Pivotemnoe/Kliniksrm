import { App, Alert, Button, Card, Descriptions, Modal, Space, Switch, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';

type Addon = { key: string; title: string; description: string; route: string; commercialType: string; entitled: boolean; futureBookings?: number; installation: { enabled: boolean; version: number } };
export function ClinicModulesPage() {
  const { message } = App.useApp(); const client = useQueryClient(); const navigate = useNavigate();
  const query = useQuery({ queryKey: ['clinic-modules'], queryFn: () => apiRequest<Addon[]>('/v1/clinic-modules') });
  const update = useMutation({ mutationFn: ({ module, enabled }: { module: Addon; enabled: boolean }) => apiRequest(`/v1/clinic-modules/${module.key}`, { method: 'PATCH', body: { enabled, version: module.installation.version } }), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['clinic-modules'] }), client.invalidateQueries({ queryKey: ['clinic-module-availability'] }), client.invalidateQueries({ queryKey: ['avito'] }), client.invalidateQueries({ queryKey: ['grooming'] }), client.invalidateQueries({ queryKey: ['pet-hotel'] })]); message.success('Состояние модуля сохранено'); }, onError: e => message.error(getErrorMessage(e)) });
  const toggle = (module: Addon, enabled: boolean) => {
    if (!enabled && module.key === 'PET_HOTEL' && module.futureBookings) {
      Modal.confirm({ title: 'Отключить новые размещения?', content: `Действующих броней: ${module.futureBookings}. История и брони сохранятся; выезд и отмена останутся доступны. Новые брони и заезды станут недоступны.`, okText: 'Отключить новые размещения', cancelText: 'Оставить включённым', onOk: () => update.mutateAsync({ module, enabled }) });
    } else if (!enabled && module.key === 'GROOMING' && module.futureBookings) {
      Modal.confirm({ title: 'Отключить новые записи на груминг?', content: `Будущих записей: ${module.futureBookings}. Они сохранятся вместе с напоминаниями и будут доступны для завершения или отмены. Новые брони станут недоступны.`, okText: 'Отключить новые записи', cancelText: 'Оставить включённым', onOk: () => update.mutateAsync({ module, enabled }) });
    } else update.mutate({ module, enabled });
  };
  return <div className="page"><PageHeader title="Подключаемые модули" description="Дополнительные возможности клиники. Подключение, отключение и лицензия находятся под управлением директора." />
    <Space direction="vertical" size={16} className="full-width">
      {query.isError && <Alert type="error" message={getErrorMessage(query.error)} showIcon />}
      {query.data?.map(module => <Card key={module.key} title={module.title} extra={<Tag color="blue">Дополнительная услуга</Tag>}>
        <Typography.Paragraph>{module.description}</Typography.Paragraph>
        <Descriptions column={1}>
          <Descriptions.Item label="Подключение"><Space><Switch aria-label={`Подключение модуля ${module.title}`} checked={module.installation.enabled} disabled={(!module.entitled && !module.installation.enabled) || update.isPending} onChange={enabled => toggle(module, enabled)} />{module.installation.enabled ? 'Подключён' : 'Отключён'}</Space></Descriptions.Item>
          <Descriptions.Item label="Доступ по лицензии">{module.entitled ? 'Доступен в этой установке' : 'Требуется подключение дополнения к лицензии'}</Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph type="secondary">{module.key === 'PET_HOTEL' ? `Отключение сохраняет историю и брони, останавливает новые размещения. Выезд и отмена остаются доступны. Действующих броней: ${module.futureBookings || 0}.` : module.key === 'GROOMING' ? `Отключение сохраняет историю и существующие брони, останавливает новые записи. Будущих записей: ${module.futureBookings || 0}.` : 'Отключение сохраняет историю и останавливает новые ответы.'} Подключение модуля само по себе не включает отправку клиентам.</Typography.Paragraph>
        <Button type="primary" onClick={() => navigate(module.route)}>Открыть модуль</Button>
      </Card>)}
    </Space>
  </div>;
}
