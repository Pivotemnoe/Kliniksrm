import { useState } from 'react';
import { Button, Card, Space, Tag } from 'antd';
import { CheckOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Overview } from './grooming.api';
export function GroomingSetup({overview}:{overview:Overview}) {
 const navigate=useNavigate(),[expanded,setExpanded]=useState(false);
 const r=overview.resources;
 const steps=[{title:'Рабочие места',done:Boolean(r?.locations.some(l=>l.isActive)&&r?.workplaces.some(w=>w.isActive)),tab:'specialists',hint:'Создайте рабочие места 1 и 2'},
 {title:'Грумер и его кабинет',done:overview.specialists.some(s=>s.isActive),tab:'specialists',hint:'Добавьте грумера прямо в модуле'},
 {title:'Услуги и цены',done:Boolean(r?.services.length),tab:'services',hint:'Прайс сайта уже добавлен; цены можно менять'},
 {title:'Длительность процедур',done:overview.rules.some(rule=>rule.isActive),tab:'services',hint:'Укажите время и назначьте грумера'},
 {title:'Расписание на месяц',done:Boolean(overview.setup?.futureWorkPeriods),tab:'calendar',hint:'Кнопка «Составить расписание»'},
 {title:'Телефон грумера',done:Boolean(overview.setup?.connectedPhones),tab:'notifications',hint:'Создайте ссылку для телефона конкретного грумера'},
 {title:'Самостоятельная запись',done:overview.settings.selfBookingEnabled,tab:'settings',hint:'Откройте запись после настройки'}];
 const ready=steps.every(s=>s.done),next=steps.find(s=>!s.done);
 return <Card className="grooming-setup-card" title={<Space><LinkOutlined/>{ready?'Модуль готов к онлайн-записи':'Подготовка онлайн-записи'}<Tag color={ready?'green':'blue'}>{steps.filter(s=>s.done).length} из {steps.length}</Tag></Space>} extra={<Button type="text" onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть':'Показать шаги'}</Button>}>
  {!ready&&next&&<Space wrap style={{marginBottom:16}}><span>Следующий шаг: {next.title.toLowerCase()}.</span><Button type="primary" size="small" onClick={()=>navigate('/grooming/'+next.tab)}>Настроить</Button></Space>}
  {expanded&&<div className="grooming-setup-steps">{steps.map((step,i)=><div key={step.title} className={'grooming-setup-step'+(step.done?' is-done':'')}><span>{step.done?<CheckOutlined/>:i+1}</span><div><Button type="link" onClick={()=>navigate('/grooming/'+step.tab)}>{step.title}</Button><small>{step.hint}</small></div></div>)}</div>}
 </Card>;
}
