import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { formatDateTime } from '../../shared/utils/date';
import { getOwner } from './owners.api';

export function RegistrationLastVisit({ ownerId, isNew, open }: { ownerId?: string; isNew: boolean; open: boolean }) {
  const owner = useQuery({ queryKey: ['owners', ownerId], queryFn: () => getOwner(ownerId!), enabled: open && !isNew && Boolean(ownerId), staleTime: 30_000 });
  let text = isNew ? 'Приёмов ещё нет' : 'Выберите владельца';
  if (!isNew && ownerId) text = owner.isError ? 'Не удалось загрузить дату' : owner.isPending ? 'Загрузка…' : lastVisitText(owner.data?.lastVisitAt);
  return <Typography.Paragraph style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', paddingBottom: 8 }}><Typography.Text strong>Последний приём владельца: </Typography.Text>{text}</Typography.Paragraph>;
}

export function lastVisitText(value: string | null | undefined) {
  return value === undefined ? 'Дата недоступна' : value ? formatDateTime(value) : 'Приёмов ещё нет';
}
