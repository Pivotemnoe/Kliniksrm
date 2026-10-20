import { useState } from 'react';
import { Button, Card, Space, Tag } from 'antd';
import { CheckOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Overview } from './grooming.api';
export function GroomingSetup({overview}:{overview:Overview}) {
 const navigate=useNavigate(),[expanded,setExpanded]=useState(false);
 const r=overview.resources;
 const steps=[{title:'Место и рабочий стол',done:Boolean(r?.locations.some(l=>l.isActive)&&r?.workplaces.some(w=>w.isActive)),tab:'settings',hint:'Где принимает грумер'},
 {title:'Специалист и MAX',done:overview.specialists.some(s=>s.isActive&&s.maxConnected),tab:'specialists',hint:'Кто принимает и получает уведомления'},
 {title:'Услуги и цены',done:Boolean(r?.services.length),tab:'services',hint:'Перенесите прайс сайта'},
 {title:'Длительность процедур',done:overview.rules.some(rule=>rule.isActive),tab:'services',hint:'Укажите время и назначьте грумера'},
 {title:'Расписание на месяц',done:Boolean(overview.setup?.futureWorkPeriods),tab:'calendar',hint:'Кнопка «Составить расписание»'},
 {title:'Самостоятельная запись',done:overview.settings.selfBookingEnabled,tab:'settings',hint:'Откройте запись после настройки'}];
 const ready=steps.every(s=>s.done),next=steps.find(s=>!s.done);
 return <Card className="grooming-setup-card" title={<Space><LinkOutlined/>{ready?'Сайт подключён к расписанию':'Подготовка онлайн-записи'}<Tag color={ready?'green':'blue'}>{steps.filter(s=>s.done).length} из {steps.length}</Tag></Space>} extra={<Button type="text" onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть':'Показать шаги'}</Button>}>
  {!ready&&next&&<Space wrap style={{marginBottom:16}}><span>Следующий шаг: {next.title.toLowerCase()}.</span><Button type="primary" size="small" onClick={()=>navigate('/grooming/'+next.tab)}>Настроить</Button></Space>}
  {(expanded||!ready)&&<div className="grooming-setup-steps">{steps.map((step,i)=><div key={step.title} className={'grooming-setup-step'+(step.done?' is-done':'')}><span>{step.done?<CheckOutlined/>:i+1}</span><div><Button type="link" onClick={()=>navigate('/grooming/'+step.tab)}>{step.title}</Button><small>{step.hint}</small></div></div>)}</div>}
 </Card>;
}
