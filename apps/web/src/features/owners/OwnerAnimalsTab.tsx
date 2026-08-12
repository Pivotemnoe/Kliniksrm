import { PlusOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { AnimalFormDrawer } from '../animals/AnimalFormDrawer';
import { AnimalArchiveModal, animalArchiveReasonLabels } from '../animals/AnimalArchiveModal';
import { AnimalStatusTag } from '../animals/animalStatus';
import { archiveAnimal, restoreAnimal } from '../animals/animals.api';
import { Animal, AnimalArchiveInput, AnimalMutationInput } from '../animals/types';
import { createOwnerAnimal, listOwnerAnimals } from './owners.api';

type OwnerAnimalsTabProps = {
  ownerId: string;
};

export function OwnerAnimalsTab({ ownerId }: OwnerAnimalsTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'animals.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [archivingAnimal, setArchivingAnimal] = useState<Animal | null>(null);
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals', { includeArchived }],
    queryFn: () => listOwnerAnimals(ownerId, includeArchived),
  });
  const createMutation = useMutation({
    mutationFn: (values: AnimalMutationInput) => createOwnerAnimal(ownerId, values),
    onSuccess: async (animal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      setCreateOpen(false);
      message.success('Пациент создан');
      navigate(`/patients/${animal.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ animalId, input }: { animalId: string; input: AnimalArchiveInput }) => archiveAnimal(animalId, input),
    onSuccess: async (archived) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      setArchivingAnimal(null);
      message.success(`Пациент «${archived.nickname}» перемещён в архив. История сохранена`);
    },
    onError: (error) => message.error(getErrorMessage(error), 8),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreAnimal,
    onSuccess: async (restored) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      message.success(`Пациент «${restored.nickname}» восстановлен`);
    },
    onError: (error) => message.error(getErrorMessage(error), 8),
  });

  function confirmRestore(animal: Animal) {
    modal.confirm({
      title: `Восстановить пациента «${animal.nickname}»?`,
      content: 'Пациент снова станет доступен для новых очередей, записей и приёмов.',
      okText: 'Восстановить',
      cancelText: 'Отмена',
      onOk: () => restoreMutation.mutateAsync(animal.id),
    });
  }
  const columns = useMemo<ColumnsType<Animal>>(
    () => [
      {
        title: 'Кличка',
        dataIndex: 'nickname',
        key: 'nickname',
        render: (value: string, record) => (
          <Space size={6}>
            <Button type="link" className="table-link" onClick={() => navigate(`/patients/${record.id}`)}>
              {value}
            </Button>
            {record.archivedAt ? <Tag color="default">Архив</Tag> : null}
          </Space>
        ),
      },
      { title: 'Вид', dataIndex: 'species', key: 'species', render: (value: string | null) => <AnimalSpeciesLabel species={value} /> },
      { title: 'Порода', dataIndex: 'breed', key: 'breed', render: (value: string | null) => value || '—' },
      { title: 'Пол', dataIndex: 'sex', key: 'sex', render: (value: string) => sexLabel[value] ?? value },
      { title: 'Возраст', dataIndex: 'birthDate', key: 'birthDate', render: (value: string | null) => formatAnimalAge(value) },
      {
        title: 'Состояние',
        dataIndex: 'status',
        key: 'status',
        render: (value: string | null, record) => record.archivedAt
          ? <Tag color="default">{record.archiveReason ? animalArchiveReasonLabels[record.archiveReason] : 'В архиве'}</Tag>
          : <AnimalStatusTag status={value} />,
      },
      ...(canManage ? [{
        title: 'Действия',
        key: 'actions',
        width: 130,
        render: (_: unknown, record: Animal) => (
          record.archivedAt ? (
            <Button
              size="small"
              icon={<UndoOutlined />}
              loading={restoreMutation.isPending && restoreMutation.variables === record.id}
              onClick={() => confirmRestore(record)}
            >
              Восстановить
            </Button>
          ) : (
            <Button
              danger
              size="small"
              icon={<StopOutlined />}
              loading={archiveMutation.isPending && archiveMutation.variables?.animalId === record.id}
              onClick={() => setArchivingAnimal(record)}
            >
              В архив
            </Button>
          )
        ),
      }] : []),
    ],
    [archiveMutation.isPending, archiveMutation.variables, canManage, navigate, restoreMutation.isPending, restoreMutation.variables],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">Пациенты владельца</Typography.Text>
        <Space wrap>
          <Checkbox checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)}>
            Показать архив
          </Checkbox>
          {canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Создать пациента
            </Button>
          ) : null}
        </Space>
      </div>
      {animalsQuery.isError ? (
        <Typography.Text type="danger">{getErrorMessage(animalsQuery.error)}</Typography.Text>
      ) : null}
      <Table<Animal>
        rowKey="id"
        columns={columns}
        dataSource={animalsQuery.data ?? []}
        loading={animalsQuery.isLoading}
        pagination={false}
        onRow={(record) => ({ onDoubleClick: () => navigate(`/patients/${record.id}`) })}
      />
      <AnimalFormDrawer
        open={createOpen}
        title="Создать пациента"
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        submitError={createMutation.error}
      />
      <AnimalArchiveModal
        open={Boolean(archivingAnimal)}
        animal={archivingAnimal}
        loading={archiveMutation.isPending}
        onCancel={() => setArchivingAnimal(null)}
        onConfirm={(input) => {
          if (archivingAnimal) archiveMutation.mutate({ animalId: archivingAnimal.id, input });
        }}
      />
    </Space>
  );
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};
