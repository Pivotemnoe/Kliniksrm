import { Button, Space, Typography } from 'antd';

export const documentVariableGroups = [
  {
    title: 'Клиника',
    variables: [
      ['clinic.name', 'Название клиники'],
      ['clinic.address', 'Адрес клиники'],
      ['organization.requisites', 'Реквизиты'],
      ['office.phone', 'Телефон филиала'],
    ],
  },
  {
    title: 'Владелец',
    variables: [
      ['owner.fullName', 'ФИО владельца'],
      ['owner.phone', 'Телефон'],
      ['owner.email', 'Email'],
      ['owner.address', 'Адрес'],
    ],
  },
  {
    title: 'Пациент',
    variables: [
      ['animal.nickname', 'Кличка'],
      ['animal.species', 'Вид'],
      ['animal.breed', 'Порода'],
      ['animal.birthDate', 'Дата рождения'],
      ['animal.microchip', 'Микрочип'],
    ],
  },
  {
    title: 'Приём',
    variables: [
      ['visit.startedAt', 'Дата приёма'],
      ['visit.totalAmount', 'Сумма'],
      ['employee.fullName', 'Сотрудник'],
      ['currentDate', 'Сегодня'],
    ],
  },
] as const;

type DocumentVariablePaletteProps = {
  onInsert?: (variable: string) => void;
};

export function DocumentVariablePalette({ onInsert }: DocumentVariablePaletteProps) {
  return (
    <Space direction="vertical" size={10} className="full-width">
      {documentVariableGroups.map((group) => (
        <div className="document-variable-group" key={group.title}>
          <Typography.Text strong>{group.title}</Typography.Text>
          <div className="document-variable-list">
            {group.variables.map(([variable, label]) =>
              onInsert ? (
                <Button key={variable} size="small" onClick={() => onInsert(variable)}>
                  {label}
                </Button>
              ) : (
                <Typography.Text key={variable} code>
                  {`{${variable}}`}
                </Typography.Text>
              ),
            )}
          </div>
        </div>
      ))}
    </Space>
  );
}
