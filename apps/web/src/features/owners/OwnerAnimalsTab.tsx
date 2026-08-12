import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Space, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
import { AnimalFormDrawer } from '../animals/AnimalFormDrawer';
import { AnimalStatusTag } from '../animals/animalStatus';
import { deleteAnimal } from '../animals/animals.api';
import { Animal, AnimalMutationInput } from '../animals/types';
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
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId),
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
  const deleteMutation = useMutation({
    mutationFn: deleteAnimal,
    onSuccess: async (deleted) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId, 'animals'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
      ]);
      message.success(`Пустая карточка пациента «${deleted.nickname}» удалена`);
    },
    onError: (error) => message.error(getErrorMessage(error), 8),
  });

  function confirmDeletion(animal: Animal) {
    modal.confirm({
      title: `Удалить пациента «${animal.nickname}» полностью?`,
      content: 'CRM удалит только пустую ошибочно созданную карточку. При наличии приёмов, счетов, вакцинаций, стационара, задач, файлов или другой истории удаление будет остановлено.',
      okText: 'Удалить пустую карточку',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => deleteMutation.mutateAsync(animal.id),
    });
  }
  const columns = useMemo<ColumnsType<Animal>>(
    () => [
      {
        title: 'Кличка',
        dataIndex: 'nickname',
        key: 'nickname',
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/patients/${record.id}`)}>
            {value}
          </Button>
        ),
      },
      { title: 'Вид', dataIndex: 'species', key: 'species', render: (value: string | null) => <AnimalSpeciesLabel species={value} /> },
      { title: 'Порода', dataIndex: 'breed', key: 'breed', render: (value: string | null) => value || '—' },
      { title: 'Пол', dataIndex: 'sex', key: 'sex', render: (value: string) => sexLabel[value] ?? value },
      { title: 'Возраст', dataIndex: 'birthDate', key: 'birthDate', render: (value: string | null) => formatAnimalAge(value) },
      { title: 'Состояние', dataIndex: 'status', key: 'status', render: (value: string | null) => <AnimalStatusTag status={value} /> },
      ...(canManage ? [{
        title: 'Действия',
        key: 'actions',
        width: 130,
        render: (_: unknown, record: Animal) => (
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleteMutation.isPending && deleteMutation.variables === record.id}
            onClick={() => confirmDeletion(record)}
          >
            Удалить
          </Button>
        ),
      }] : []),
    ],
    [canManage, deleteMutation.isPending, deleteMutation.variables, navigate],
  );

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="toolbar-row">
        <Typography.Text type="secondary">Пациенты владельца</Typography.Text>
        {canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Создать пациента
          </Button>
        ) : null}
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
    </Space>
  );
}

const sexLabel: Record<string, string> = {
  MALE: 'Самец',
  FEMALE: 'Самка',
  UNKNOWN: 'Не указан',
};
