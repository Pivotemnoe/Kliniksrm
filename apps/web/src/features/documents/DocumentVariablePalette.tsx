import { Button, Space, Typography } from 'antd';

export const documentVariableGroups = [
  {
    title: 'Клиника',
    block: `КЛИНИКА
{clinic.name}
Адрес: {clinic.address}
Телефон: {office.phone}
Реквизиты: {organization.requisites}`,
    variables: [
      ['clinic.name', 'Название клиники'],
      ['clinic.address', 'Адрес клиники'],
      ['organization.requisites', 'Реквизиты'],
      ['office.phone', 'Телефон филиала'],
    ],
  },
  {
    title: 'Владелец',
    block: `ВЛАДЕЛЕЦ
ФИО: {owner.fullName}
Телефон: {owner.phone}
Email: {owner.email}
Адрес: {owner.address}`,
    variables: [
      ['owner.fullName', 'ФИО владельца'],
      ['owner.phone', 'Телефон'],
      ['owner.email', 'Email'],
      ['owner.address', 'Адрес'],
    ],
  },
  {
    title: 'Пациент',
    block: `ПАЦИЕНТ
Кличка: {animal.nickname}
Вид: {animal.species}
Порода: {animal.breed}
Дата рождения: {animal.birthDate}
Микрочип: {animal.microchip}`,
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
    block: `ПРИЁМ
Дата: {visit.startedAt}
Врач: {employee.fullName}
Сумма: {visit.totalAmount}`,
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
  onInsertBlock?: (block: string) => void;
};

export function DocumentVariablePalette({ onInsert, onInsertBlock }: DocumentVariablePaletteProps) {
  return (
    <Space direction="vertical" size={10} className="full-width">
      {onInsert ? (
        <Typography.Text type="secondary">
          Выберите текстовый блок: поле добавится в его конец и заполнится данными при создании документа в приёме.
        </Typography.Text>
      ) : null}
      {documentVariableGroups.map((group) => (
        <div className="document-variable-group" key={group.title}>
          <div className="document-variable-group-header">
            <Typography.Text strong>{group.title}</Typography.Text>
            {onInsertBlock ? (
              <Button size="small" type="dashed" onClick={() => onInsertBlock(group.block)}>
                Вставить блок
              </Button>
            ) : null}
          </div>
          <div className="document-variable-list">
            {group.variables.map(([variable, label]) =>
              onInsert ? (
                <Button key={variable} size="small" title={`Вставить {${variable}} в позицию курсора`} onClick={() => onInsert(variable)}>
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
