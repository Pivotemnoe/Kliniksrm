import test from "node:test";
import assert from "node:assert/strict";
import { supportSession, nextSupportPrompt, markSupportPrompt, startSupportSchedule, readSupportSession, saveSupportSession, PROMPT_QUIET_MS } from "../src/support-schedule.js";

const ready = { path: "/", busy: false, hidden: false, overlay: false };
test("separate offers at 1, 10, 15 active minutes, checkup always first, no fourth offer", () => {
  const session = supportSession();
  session.chatUsed = true;
  for (const [minute, id] of [[1,"checkup"],[10,"castration"],[15,"sterilization"]]) {
    session.activeMs = minute * 60_000 - 1;
    assert.equal(nextSupportPrompt(session, ready), null);
    session.activeMs++;
    const event = nextSupportPrompt(session, ready);
    assert.deepEqual(event, { type:"offer", id });
    markSupportPrompt(session, event);
    assert.equal(nextSupportPrompt(session, ready), null);
  }
  session.activeMs = 60 * 60_000;
  assert.equal(nextSupportPrompt(session, ready), null);
});
test("quiet period, active overlays, chat, forms, menus, hidden and excluded routes prevent prompts", () => {
  const session = supportSession({activeMs: 900_000});
  for (const patch of [{busy:true},{hidden:true},{overlay:true},{path:"/visit"},{path:"/night"},{path:"/offers"}])
    assert.equal(nextSupportPrompt(session, {...ready,...patch}), null);
  assert.equal(nextSupportPrompt(session, ready).id, "checkup");
  markSupportPrompt(session, {type:"offer",id:"checkup"});
  session.activeMs += PROMPT_QUIET_MS - 1;
  assert.equal(nextSupportPrompt(session, ready), null);
  session.activeMs++;
  assert.equal(nextSupportPrompt(session, ready).id, "castration");
  session.offersMuted = true;
  session.chatUsed = true;
  assert.equal(nextSupportPrompt(session, ready), null);
});
test("chat hints are at most twice, stop after chat use or deliberate dismissal", () => {
  const session = supportSession({offersMuted:true});
  for (const at of [180_000,720_000]) {
    session.activeMs = at - 1;
    assert.equal(nextSupportPrompt(session, ready), null);
    session.activeMs++;
    const event = nextSupportPrompt(session, ready);
    assert.deepEqual(event,{type:"chat"});
    markSupportPrompt(session,event);
  }
  session.activeMs = 3_600_000;
  assert.equal(nextSupportPrompt(session,ready),null);
  for(const patch of [{chatUsed:true},{chatHintMuted:true}])
    assert.equal(nextSupportPrompt(supportSession({activeMs:180_000,offersMuted:true,...patch}),ready),null);
});
test("actual scheduler counts active time, pauses, and never credits long sleeping intervals", () => {
  let now=0, callback, stopped=false, saves=0;
  const clock={performance:{now:()=>now},setInterval:fn=>{callback=fn;return 1;},clearInterval:()=>{stopped=true;}};
  const session=supportSession();
  let context={...ready};
  const events=[];
  const stop=startSupportSchedule({session,context:()=>context,show:event=>events.push(event),save:()=>saves++,clock});
  const tick=()=>{now+=1000;callback();};
  for(let i=0;i<59;i++)tick();
  assert.equal(events.length,0);
  context.hidden=true;
  for(let i=0;i<60;i++)tick();
  assert.equal(session.activeMs,59_000);
  context.hidden=false;tick();
  assert.deepEqual(events,[{type:"offer",id:"checkup"}]);
  context.overlay=true;
  for(let i=0;i<540;i++)tick();
  assert.equal(session.activeMs,600_000);
  assert.equal(events.length,1);
  context.overlay=false;tick();
  assert.equal(events[1].id,"castration");
  const before=session.activeMs;
  now+=3_600_000;callback();
  assert.equal(session.activeMs-before,1500);
  assert.ok(saves>0);stop();assert.equal(stopped,true);
});
test("visit persists across reloads; blocked or corrupted storage fails safely without personal data", () => {
  const values=new Map();
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const session=supportSession({activeMs:123_000,shownOffers:["checkup"],offersMuted:true,phone:"private",chatUsed:true});
  saveSupportSession(storage,session);
  assert.deepEqual(readSupportSession(storage),session);
  assert.equal([...values.values()].join("").includes("private"),false);
  const broken={getItem(){throw Error();},setItem(){throw Error();}};
  assert.deepEqual(readSupportSession(broken),supportSession());
  assert.doesNotThrow(()=>saveSupportSession(broken,session));
  assert.deepEqual(supportSession("invalid"),supportSession());
  assert.deepEqual(supportSession({shownOffers:"checkup"}).shownOffers,[]);
  assert.deepEqual(supportSession({shownOffers:{includes:5}}).shownOffers,[]);
});
