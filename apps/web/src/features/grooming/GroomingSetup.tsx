import { useState } from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { CheckOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { at, day, Overview } from './grooming.api';
export function GroomingSetup({ overview }: { overview: Overview }) {
  const navigate = useNavigate(), [expanded, setExpanded] = useState(false), resources = overview.resources;
  const steps = [
    { title: 'Добавить грумера', done: overview.specialists.some(s => s.isActive), tab: 'specialists', hint: 'Собственный профиль и вход в кабинет' },
    { title: 'Подготовить место в салоне', done: Boolean(resources?.workplaces.some(w => w.isActive)), tab: 'specialists', hint: 'Стол или другое место приёма' },
    { title: 'Проверить прайс', done: Boolean(resources?.services.some(s=>s.isActive)), tab: 'services', hint: 'Время любой услуги выбирается при ручной записи в календаре' },
    { title: 'Назначить место и рабочие часы', done: Boolean(overview.setup?.groomers?.some(g => g.calendarReady)), tab: 'calendar', hint: 'В смене выбираются грумер, место и часы' },
  ];
  const ready = steps.every(s => s.done), next = steps.find(s => !s.done);
  if (ready && !expanded) return <Space wrap className="grooming-setup-ready"><CheckOutlined /><Typography.Text>Грумеры, места и прайс готовы. Записывайте в календаре.</Typography.Text><Button type="link" size="small" onClick={() => setExpanded(true)}>Настройка</Button></Space>;
  return <Card className="grooming-setup-card" title={<Space><LinkOutlined />{ready ? 'Календарь готов к ручной записи' : 'Подготовка календаря груминга'}<Tag color={ready ? 'green' : 'blue'}>{steps.filter(s => s.done).length} из 4</Tag></Space>} extra={<Button type="text" onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть' : 'Как настроить'}</Button>}>
    {next && <Space wrap style={{ marginBottom: 12 }}><span>Следующий шаг: {next.title.toLowerCase()}.</span><Button type="primary" size="small" onClick={() => navigate('/grooming/' + next.tab)}>Открыть</Button></Space>}
    {expanded && <><div className="grooming-setup-steps">{steps.map((step, i) => <div key={step.title} className={'grooming-setup-step' + (step.done ? ' is-done' : '')}><span>{step.done ? <CheckOutlined /> : i + 1}</span><div><Button type="link" onClick={() => navigate('/grooming/' + step.tab)}>{step.title}</Button><small>{step.hint}</small></div></div>)}</div><Typography.Paragraph type="secondary">Всё назначение делается в календаре: грумер → место и рабочие часы → услуга и интервал записи. Длительность можно менять с шагом полчаса. Телефон подключается отдельно к кабинету грумера.</Typography.Paragraph></>}
    {(expanded || !ready) && overview.setup?.groomers?.map(g => <div className="grooming-setup-person" key={g.specialistId}><div><strong>{g.displayName}</strong><div><Tag color={g.nextShift?.workplaceName ? 'blue' : 'orange'}>{g.nextShift?.workplaceName || 'Место в смене не назначено'}</Tag><Tag>{g.phoneConnected ? 'Телефон подключён' : 'Телефон не подключён'}</Tag></div><small>{g.nextShift ? `Ближайшая смена: ${at(g.nextShift.startsAt)}–${at(g.nextShift.endsAt)}` : 'Рабочие часы ещё не заданы'}</small></div><Space wrap><Button size="small" onClick={() => navigate(`/grooming/calendar?date=${g.nextShift ? day(g.nextShift.startsAt) : ''}&groomer=${g.employeeId}`)}>Открыть календарь</Button><Button size="small" onClick={() => navigate(`/grooming/calendar?groomer=${g.employeeId}&schedule=1`)}>Место и часы</Button></Space></div>)}
  </Card>;
}
