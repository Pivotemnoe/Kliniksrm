import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const source=(await readFile(new URL('../apps/owner-gateway/public/grooming.js',import.meta.url),'utf8')).replace(/\nvoid start\(\);\s*$/,'\n');
const original={id:'booking-one',startsAt:'2035-01-01T12:00:00+03:00',endsAt:'2035-01-01T13:30:00+03:00',version:1,status:'CONFIRMED',location:{timezone:'Europe/Moscow',name:'Салон'},animal:{nickname:'Ричи'},employee:{fullName:'Анна'},serviceTitle:'Уход',price:'1250',notes:'',looks:[]};

function fixture(fresh={...original,endsAt:'2035-01-01T14:00:00+03:00',version:2},defer=false){
 const duration=[{dataset:{bookingDuration:original.id},textContent:''},{dataset:{bookingDuration:original.id},textContent:''}],start=[{dataset:{bookingStart:original.id},textContent:''}],notice={hidden:true,textContent:''},timers=[],pending=new Map();let calls=0,rootWrites=0,release;
 const app={querySelectorAll(selector){return selector==='[data-booking-duration]'?duration:selector==='[data-booking-start]'?start:[]},set innerHTML(value){rootWrites++}};
 const document={hidden:false,querySelector(s){return s==='#grooming-app'?app:s==='#booking-time-update'?notice:s==='#logout'?{}:null},addEventListener(){}};
 const gate=defer?new Promise(resolve=>{release=resolve}):Promise.resolve();
 const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:''},URLSearchParams,Date,Intl,crypto:{randomUUID},sessionStorage:{getItem:k=>pending.get(k)||null,setItem:(k,v)=>pending.set(k,v),removeItem:k=>pending.delete(k)},setInterval:(fn,ms)=>{timers.push(ms);return 1},clearInterval(){},setTimeout,console,fetch:async()=>{calls++;await gate;return{ok:true,json:async()=>({status:'DONE',result:{bookings:[fresh]}})}}});
 vm.runInContext(source,context);vm.runInContext(`state=${JSON.stringify({bookings:[original],minimumCancelMinutes:0,selfBookingEnabled:true})};draft={notes:'Не потерять пожелания',animalId:'pet-two'};`,context);
 return{context,duration,start,notice,timers,pending,document,run:code=>vm.runInContext(code,context),refresh:()=>vm.runInContext('refreshBookingTimes()',context),get calls(){return calls},get rootWrites(){return rootWrites},release:()=>release?.()};
}

test('confirmed client cards show the current duration and estimated end, including the next day',()=>{
 const f=fixture();assert.match(f.run(`bookingCard(${JSON.stringify({...original,endsAt:'2035-01-01T14:00:00+03:00'})})`),/Длительность: 2 ч/);assert.match(f.run(`bookingDurationText(${JSON.stringify({...original,endsAt:'2035-01-01T14:00:00+03:00'})})`),/14:00/);
 assert.match(f.run(`bookingDurationText(${JSON.stringify({...original,startsAt:'2035-01-01T23:30:00+03:00',endsAt:'2035-01-02T01:00:00+03:00'})})`),/2 января 2035/);
 assert.equal(f.run('durationLabel(30)'),'30 мин');assert.equal(f.run('durationLabel(90)'),'1 ч 30 мин');assert.equal(f.run('durationLabel(120)'),'2 ч');
});

test('a duration update changes both cards and version without replacing the booking form',async()=>{
 const f=fixture();await f.refresh();assert.equal(f.calls,1);assert.equal(f.rootWrites,0);assert(f.duration.every(e=>e.textContent.includes('2 ч')&&e.textContent.includes('14:00')));assert.match(f.notice.textContent,/было 1 ч 30 мин, стало 2 ч/);assert.equal(f.notice.hidden,false);assert.equal(f.run('state.bookings[0].version'),2);assert.equal(f.run('draft.notes'),'Не потерять пожелания');assert.equal(f.run('draft.animalId'),'pet-two');await f.refresh();assert.equal(f.calls,1,'focus/visibility bursts are throttled');assert.deepEqual(f.timers,[60000]);
});

test('hidden pages, selected offers, rescheduling, writes and pending operations do not fetch',async()=>{
 const f=fixture();for(const flag of ['busy','moving','selected']){f.run(`${flag}=true`);await f.refresh();f.run(`${flag}=${flag==='busy'?'false':flag==='moving'?'null':"''"}`)}f.document.hidden=true;await f.refresh();f.document.hidden=false;f.pending.set('temichevvet-grooming-pending-operation','existing-write');await f.refresh();assert.equal(f.calls,0);f.pending.clear();await f.refresh();assert.equal(f.calls,1);
});

test('an in-flight response cannot overwrite a newer state or an active write',async()=>{
 for(const mutation of ['busy=true','state={bookings:[]}']){const f=fixture(undefined,true),promise=f.refresh();f.run(mutation);f.release();await promise;assert.equal(f.duration[0].textContent,'');assert.equal(f.notice.hidden,true);assert.equal(f.rootWrites,0)}
});

test('unchanged bookings and transport failures preserve the client draft',async()=>{
 const same=fixture({...original});await same.refresh();assert.equal(same.notice.hidden,true);assert.equal(same.rootWrites,0);
 const failed=fixture();failed.run('fetch=async()=>{throw Error("offline")}');await failed.refresh();assert.equal(failed.run('draft.notes'),'Не потерять пожелания');assert.equal(failed.rootWrites,0);assert.equal(failed.run('bookingRefreshRunning'),false);
});
