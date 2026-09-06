import { PrinterOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Drawer, QRCode, Space, Spin, Tag, Typography } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { createPortalInvite, getPortalStatuses } from '../notifications/notifications.api';
import type { ClientPortalInvite, PortalActivationStatus } from '../notifications/types';
import { printPortalInvite } from '../owners/OwnerCommunicationTab';

type QueueOwner = { ownerId: string | null; owner?: { fullName: string } | null; ownerName: string | null };
type SelectedOwner = { id: string; name: string };

export function useQueuePortalInvitations(records: QueueOwner[]) {
  const { data: auth } = useCurrentEmployee();
  const canRead = hasPermission(auth?.employee, 'owners.read');
  const canInvite = canRead && (hasPermission(auth?.employee, 'notifications.manage') || hasPermission(auth?.employee, 'owners.manage'));
  const ownerIds = [...new Set(records.flatMap((record) => record.ownerId ? [record.ownerId] : []))].sort();
  // Optional reminder only: this query must never gate queue or clinical actions.
  const statusQuery = useQuery({
    queryKey: ['queue-portal-statuses', ownerIds],
    queryFn: async () => {
      const statuses: Record<string, PortalActivationStatus> = {};
      for (let offset = 0; offset < ownerIds.length; offset += 100) {
        const result = await getPortalStatuses(ownerIds.slice(offset, offset + 100));
        for (const item of result.items) statuses[item.ownerId] = item.status;
      }
      return statuses;
    },
    enabled: canRead && ownerIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const [selected, setSelected] = useState<SelectedOwner | null>(null);
  const [open, setOpen] = useState(false);
  const openInvitation = useCallback((record: QueueOwner) => {
    if (!record.ownerId) return;
    setSelected({ id: record.ownerId, name: record.owner?.fullName ?? record.ownerName ?? 'Владелец' });
    setOpen(true);
  }, []);

  return {
    canRead, canInvite, statuses: statusQuery.data, loading: statusQuery.isLoading,
    openInvitation,
    drawer: selected ? <QueuePortalInvitationDrawer key={selected.id} owner={selected} open={open} onClose={() => setOpen(false)} /> : null,
  };
}

export function QueuePortalInvitationButton({ ownerId, status, loading, canInvite, onClick, compact = false }: {
  ownerId: string | null;
  status?: PortalActivationStatus;
  loading: boolean;
  canInvite: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  if (!ownerId) return <Typography.Text type="secondary">Сначала заведите владельца</Typography.Text>;
  if (loading) return <Typography.Text type="secondary">Проверяем личный кабинет…</Typography.Text>;
  if (status === 'ACTIVATED') return <Tag color="green">Личный кабинет активирован</Tag>;
  if (status === 'BLOCKED' || status === 'SUSPENDED') {
    return <Tag color="red">{status === 'BLOCKED' ? 'Личный кабинет заблокирован' : 'Личный кабинет приостановлен'}</Tag>;
  }
  return <Space direction="vertical" size={2}>
    <Typography.Text type={status === 'NOT_ACTIVATED' ? 'warning' : 'secondary'}>
      {status === 'NOT_ACTIVATED' ? 'Личный кабинет не активирован' : 'Статус кабинета не проверен'}
    </Typography.Text>
    {canInvite ? <Button size={compact ? 'small' : 'middle'} icon={<QrcodeOutlined />} onClick={onClick}>
      Пригласить в личный кабинет
    </Button> : null}
  </Space>;
}

function QueuePortalInvitationDrawer({ owner, open, onClose }: { owner: SelectedOwner; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const qrContainer = useRef<HTMLDivElement>(null);
  const [invite, setInvite] = useState<ClientPortalInvite | null>(null);
  const [started, setStarted] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await createPortalInvite(owner.id, { channel: 'WEB', onlyIfNotActivated: true });
      if (result.gatewaySync !== 'synced' || !result.deliveryUrls?.WEB || !result.deliveryUrls.TELEGRAM || !result.deliveryUrls.MAX) {
        throw new Error('Не удалось подготовить приглашение. Проверьте интернет и повторите попытку.');
      }
      return result;
    },
    onSuccess: (result) => setInvite(result),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['queue-portal-statuses'] });
      void queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] });
    },
  });

  function prepare() {
    setStarted(true);
    setInvite(null);
    mutation.mutate();
  }

  function print() {
    const qr = qrContainer.current?.querySelectorAll('svg');
    if (!invite?.deliveryUrls || !qr || qr.length !== 3) return;
    const printed = printPortalInvite({
      ownerName: owner.name, inviteExpiresAt: invite.inviteExpiresAt ?? null,
      webLink: invite.deliveryUrls.WEB!, telegramLink: invite.deliveryUrls.TELEGRAM!, maxLink: invite.deliveryUrls.MAX!,
      webQrSvg: qr[0].outerHTML, telegramQrSvg: qr[1].outerHTML, maxQrSvg: qr[2].outerHTML,
    });
    if (!printed) message.warning('Разрешите всплывающие окна в браузере и повторите печать.');
  }

  const expired = Boolean(invite?.inviteExpiresAt && Date.parse(invite.inviteExpiresAt) <= Date.now());
  return <Drawer title={`Приглашение в личный кабинет: ${owner.name}`} width={760} open={open} onClose={onClose}
    afterOpenChange={(visible) => { if (visible && !started) prepare(); }}
    extra={<Button onClick={onClose}>Назад в очередь</Button>}>
    <Space direction="vertical" size={16} className="full-width">
      {mutation.isPending ? <Spin tip="Готовим приглашение…"><div style={{ minHeight: 100 }} /></Spin> : null}
      {mutation.error ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} /> : null}
      {invite && !expired ? <>
        <Typography.Text>Владелец может выбрать браузер, Telegram или MAX. Приглашение действует 24 часа.</Typography.Text>
        <div ref={qrContainer} className="portal-invite-qr-grid">
          {(['WEB', 'TELEGRAM', 'MAX'] as const).map((channel, index) => <div key={channel} className="portal-invite-qr-option">
            <Typography.Text strong>{['Открыть в браузере', 'Подключить Telegram', 'Подключить MAX'][index]}</Typography.Text>
            <div className="portal-qr-card"><QRCode value={invite.deliveryUrls![channel]!} type="svg" size={156} /></div>
          </div>)}
        </div>
        <Button type="primary" icon={<PrinterOutlined />} onClick={print}>Распечатать А5 — 3 QR-кода</Button>
      </> : null}
      {(mutation.isError || expired) ? <Button loading={mutation.isPending} onClick={prepare}>Подготовить приглашение ещё раз</Button> : null}
    </Space>
  </Drawer>;
}
