import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Select, Space } from 'antd';
import { apiRequest } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { coatLabels, groomingPrice, sizeLabels, time, type Client, type Offer, type Overview } from '../grooming/grooming.api';
import { staffAppBase, type MobileBooking, type MobileProfile } from './staffApp.api';
import { staffCommandKey } from './staffPlatform';
type Contact = Client & { clientAccessToken?: string };
type Resources = { employees: { id: string; fullName: string }[]; rooms: { id: string; name: string; officeId: string }[] };
const send = <T,>(path: string, body: unknown) => {
  if (!navigator.onLine) return Promise.reject(new Error('Нет связи. Действие не отправлено.'));
  return apiRequest<T>(`${staffAppBase}/${path}`, { method: 'POST', body });
};
const mutationOptions = { networkMode: 'always' as const, retry: false as const };

export function BookingForm({ profile, initial, date, onSaved }: { profile: MobileProfile; initial?: MobileBooking; date: string; onSaved: (date: string) => void }) {
  const grooming = profile.kind === 'GROOMING', { message } = App.useApp(), client = useQueryClient();
  const [form] = Form.useForm(), [petForm] = Form.useForm(), [search, setSearch] = useState(''), [phone, setPhone] = useState('');
  const species = Form.useWatch('species', form);
  const [extraContacts, setExtraContacts] = useState<Contact[]>([]), [selectedContact, setSelectedContact] = useState<Contact | null>(initial ? { id: initial.ownerId, fullName: initial.owner.fullName, phone: initial.owner.phone, animals: [{ id: initial.animalId, ...initial.animal }] } : null);
  const [offers, setOffers] = useState<Offer[]>([]), [selectedOffer, setSelectedOffer] = useState('');
  const [showClientForm, setShowClientForm] = useState(false), [showPetForm, setShowPetForm] = useState(false);
  const key = useRef(staffCommandKey());
  const contacts = useQuery({ queryKey: ['staff-app', 'clients', search], queryFn: () => apiRequest<Contact[]>(`${staffAppBase}/clients?search=${encodeURIComponent(search)}`) });
  const overview = useQuery({ queryKey: ['staff-app', 'grooming-resources'], queryFn: () => apiRequest<Overview>(`${staffAppBase}/grooming/overview`), enabled: grooming });
  const clinic = useQuery({ queryKey: ['staff-app', 'clinic-resources'], queryFn: () => apiRequest<Resources>(`${staffAppBase}/clinic/resources`), enabled: !grooming });
  const catalog = useQuery({ queryKey: ['staff-app', 'pet-catalog'], queryFn: () => apiRequest<{ title: string; breeds: { title: string }[] }[]>(`${staffAppBase}/pet-catalog`), enabled: grooming && showPetForm });
  const [petSpecies, setPetSpecies] = useState('');
  const addContact = (contact: Contact) => {
    setExtraContacts(current => [contact, ...current.filter(item => item.id !== contact.id)]); setSelectedContact(contact);
    form.setFieldsValue({ ownerId: contact.id, animalId: contact.animals[0]?.id }); setShowClientForm(false); setShowPetForm(false); setOffers([]); setSelectedOffer('');
  };
  const lookup = useMutation({ ...mutationOptions, mutationFn: () => send<Contact[]>('clients/lookup', { phone }), onSuccess: found => {
    if (found.length) addContact(found[0]); else { setShowClientForm(true); message.info('Клиент не найден. Можно добавить карточку.'); }
  }, onError: error => message.error(getErrorMessage(error)) });
  const newClient = useMutation({ ...mutationOptions, mutationFn: (values: { fullName: string }) => send<Contact>('clients', { ...values, phone }), onSuccess: addContact, onError: error => message.error(getErrorMessage(error)) });
  const newPet = useMutation({ ...mutationOptions, mutationFn: (values: Record<string, unknown>) => send<Client['animals'][number]>(`clients/${selectedContact!.id}/pets`, { ...values, clientAccessToken: selectedContact!.clientAccessToken }), onSuccess: pet => {
    const updated = { ...selectedContact!, animals: [...selectedContact!.animals, pet] }; addContact(updated); form.setFieldValue('animalId', pet.id); setShowPetForm(false);
  }, onError: error => message.error(getErrorMessage(error)) });
  const findOptions = useMutation({ ...mutationOptions, mutationFn: (values: Record<string, unknown>) => send<{ offers: Offer[] }>('grooming/options', {
    ownerId: values.ownerId, animalId: values.animalId, serviceId: values.serviceId, species: values.species, size: values.size, coat: values.coat, date: values.date,
    clientAccessToken: selectedContact?.clientAccessToken, ...(initial ? { reservationId: initial.id } : {}) }), onSuccess: result => { setOffers(result.offers); setSelectedOffer(''); }, onError: error => message.error(getErrorMessage(error)) });
  const save = useMutation({ ...mutationOptions, mutationFn: async (values?: Record<string, unknown>) => {
    if (grooming) {
      if (!selectedContact || !selectedOffer) throw new Error('Выберите клиента и свободное время');
      return send(initial ? `grooming/bookings/${initial.id}/reschedule?version=${initial.version}` : 'grooming/bookings', {
        ownerId: selectedContact.id, offerToken: selectedOffer, clientKey: key.current, notes: form.getFieldValue('notes') || '', looks: [], contactConsent: true, bookingConsent: true,
      });
    }
    const input = { ...values };
    if (!input.roomId) delete input.roomId;
    input.startsAt = new Date(`${String(input.startsAt)}:00+03:00`).toISOString();
    return send('clinic/appointments', { ...input, clientKey: key.current });
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['staff-app'] }); await client.invalidateQueries({ queryKey: ['grooming'] }); message.success('Запись сохранена в общем расписании CRM'); onSaved(String(form.getFieldValue(grooming ? 'date' : 'startsAt')).slice(0, 10)); }, onError: error => message.error(getErrorMessage(error)) });
  useEffect(() => { key.current = staffCommandKey(); }, [selectedOffer]);
  const all = [...new Map([...(selectedContact ? [selectedContact] : []), ...extraContacts, ...(contacts.data || [])].map(item => [item.id, item])).values()];
  const busy = save.isPending || findOptions.isPending;
  const errors = [contacts.error, overview.error, clinic.error, catalog.error, findOptions.error, save.error].filter(Boolean);
  return <div className="staff-form">
    {errors.map((error, index) => <Alert key={index} type="error" message={getErrorMessage(error)} />)}
    {grooming && !initial && <><label htmlFor="staff-client-phone">Найти клиента по полному номеру телефона</label><Space.Compact block style={{ margin: '10px 0 16px' }}>
      <Input id="staff-client-phone" type="tel" autoComplete="tel" value={phone} placeholder="+7 …" onChange={event => { setPhone(event.target.value); setShowClientForm(false); }} /><Button onClick={() => lookup.mutate()} loading={lookup.isPending} disabled={phone.replace(/\D/g, '').length < 10}>Найти</Button>
    </Space.Compact>{showClientForm && <Form layout="vertical" onFinish={values => newClient.mutate(values)}><Form.Item name="fullName" label="Имя нового клиента" rules={[{ required: true, min: 2 }]}><Input /></Form.Item><Button onClick={() => setShowClientForm(false)}>Отмена</Button> <Button htmlType="submit" loading={newClient.isPending}>Добавить клиента</Button></Form>}</>}
    <Form form={form} layout="vertical" initialValues={{ ownerId: initial?.ownerId, animalId: initial?.animalId, date, serviceId: initial?.rule?.serviceId, notes: initial?.notes, species: initial?.species, size: initial?.size, coat: initial?.coat }}
      onValuesChange={changed => { if (changed.ownerId) { const contact = all.find(item => item.id === changed.ownerId) || null; setSelectedContact(contact); form.setFieldValue('animalId', contact?.animals[0]?.id); } if (changed.species) form.setFieldValue('size', changed.species === 'CAT' ? 'ANY' : undefined); setOffers([]); setSelectedOffer(''); }}
      onFinish={values => grooming ? findOptions.mutate(values) : save.mutate(values)}>
      <Form.Item name="ownerId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}><Select showSearch filterOption={grooming ? true : false} optionFilterProp="label" onSearch={grooming ? undefined : setSearch} placeholder={grooming ? 'Ваши клиенты' : 'Введите имя или телефон'} disabled={Boolean(initial) || busy} options={all.map(contact => ({ value: contact.id, label: `${contact.fullName}${contact.phone ? ` · ${contact.phone}` : ''}` }))} /></Form.Item>
      <Form.Item name="animalId" label="Питомец" rules={[{ required: true, message: 'Выберите питомца' }]}><Select disabled={Boolean(initial) || busy} options={(selectedContact?.animals || []).map(pet => ({ value: pet.id, label: `${pet.nickname}${pet.species ? ` · ${pet.species}` : ''}` }))} /></Form.Item>
      {grooming && selectedContact && !initial && <Button className="staff-pet-choice" type="link" onClick={() => setShowPetForm(value => !value)}>Добавить питомца клиенту</Button>}
      {grooming ? <>
        <Form.Item name="serviceId" label="Услуга" rules={[{ required: true }]}><Select options={[...new Map((overview.data?.rules || []).filter(rule => rule.isActive).map(rule => [rule.serviceId, { value: rule.serviceId, label: rule.service.title }])).values()]} /></Form.Item>
        <Form.Item name="species" label="Вид питомца" rules={[{ required: true }]}><Select options={[{ value: 'DOG', label: 'Собака' }, { value: 'CAT', label: 'Кошка' }]} /></Form.Item>
        <Form.Item name="size" label="Размер" rules={[{ required: true }]}><Select options={Object.entries(sizeLabels).filter(([value]) => species !== 'DOG' || value !== 'ANY').map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="coat" label="Шерсть" rules={[{ required: true }]}><Select options={Object.entries(coatLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="date" label="Дата" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        <Form.Item name="notes" label="Пожелания"><Input.TextArea maxLength={2000} /></Form.Item>
      </> : <>
        <Form.Item name="employeeId" label="Врач" rules={[{ required: true }]}><Select options={clinic.data?.employees.map(employee => ({ value: employee.id, label: employee.fullName }))} /></Form.Item>
        <Form.Item name="roomId" label="Кабинет"><Select allowClear placeholder="По правилам расписания" options={clinic.data?.rooms.map(room => ({ value: room.id, label: room.name }))} /></Form.Item>
        <Form.Item name="startsAt" label="Начало приёма (МСК)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="comment" label="Комментарий"><Input.TextArea maxLength={1000} /></Form.Item>
      </>}
      <Button type="primary" htmlType="submit" loading={busy} disabled={!navigator.onLine}>{grooming ? 'Найти свободное время' : 'Создать запись'}</Button>
    </Form>
    {grooming && findOptions.isSuccess && !offers.length && <Alert type="info" message="Свободного времени на эту дату нет" description="Выберите другую дату. Рабочие смены и услуги настраиваются в CRM." />}
    {!!offers.length && <><h3>Свободное время</h3><div className="staff-options">{offers.map(offer => <button type="button" key={offer.offerToken} aria-pressed={selectedOffer === offer.offerToken} onClick={() => setSelectedOffer(offer.offerToken)}>{time(offer.startsAt)} · {groomingPrice(offer)}</button>)}</div>
      <p>Выбранное время ещё не забронировано. Оно проверится при подтверждении.</p><Button block type="primary" disabled={!selectedOffer || !navigator.onLine} loading={save.isPending} onClick={() => save.mutate(undefined)}>{initial ? 'Подтвердить перенос' : 'Подтвердить запись'}</Button></>}
    {showPetForm && selectedContact && <div className="staff-card"><h3>Новый питомец</h3><Form form={petForm} layout="vertical" onFinish={values => newPet.mutate(values)}>
      <Form.Item name="nickname" label="Кличка" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="species" label="Вид" rules={[{ required: true }]}><Select onChange={value => { setPetSpecies(value); petForm.setFieldValue('breed', undefined); }} options={catalog.data?.filter(item => /собак|кош/i.test(item.title)).map(item => ({ value: item.title, label: item.title }))} /></Form.Item>
      <Form.Item name="breed" label="Порода" rules={[{ required: true }]}><Select showSearch options={catalog.data?.find(item => item.title === petSpecies)?.breeds.map(breed => ({ value: breed.title, label: breed.title }))} /></Form.Item>
      <Button htmlType="submit" loading={newPet.isPending}>Сохранить питомца</Button>
    </Form></div>}
  </div>;
}
