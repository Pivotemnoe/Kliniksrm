import { useEffect } from "react";
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
export function useGroomingMotion(enabled,onChapter) {
 useEffect(()=>{
  const media=matchMedia("(prefers-reduced-motion: reduce)");
  let frame=0,visible=true;
  const render=()=>{
   frame=0; const off=!enabled||media.matches;
   document.documentElement.dataset.motion=off?"off":"on";
   const hero=document.querySelector(".hero");
   if(hero){const r=hero.getBoundingClientRect(),p=clamp(-r.top/r.height);hero.style.setProperty("--hero-y",off?"0px":Math.min(110,-r.top*.12)+"px");hero.style.setProperty("--detail-opacity",!off&&p>.12&&p<.75?"1":"0");if(!off&&r.top< -70&&r.bottom>0)onChapter(Math.min(2,Math.floor(p*4)));}
   document.querySelectorAll(".intro-photos figure").forEach((el,i)=>{const r=el.getBoundingClientRect();const p=off?1:clamp((innerHeight-r.top)/(innerHeight*.7));el.style.setProperty("--photo-drift",off?"0px":(1-p)*(i?30:-20)+"px");});
   document.querySelectorAll(".look-card").forEach((el,i)=>{const r=el.getBoundingClientRect();const p=off?1:clamp((innerHeight-r.top)/(innerHeight*.55));el.style.setProperty("--look-reveal",p);el.style.setProperty("--look-drift",off?"0px":(i-1)*(1-p)*-32+"px");});

  };
  const schedule=()=>{if(!frame&&visible)frame=requestAnimationFrame(render);};
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");observer.unobserve(e.target);}}),{threshold:.12});
  document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
  const visibility=()=>{visible=!document.hidden;if(visible)schedule();};
  addEventListener("scroll",schedule,{passive:true});addEventListener("resize",schedule);document.addEventListener("visibilitychange",visibility);media.addEventListener("change",schedule);schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();removeEventListener("scroll",schedule);removeEventListener("resize",schedule);document.removeEventListener("visibilitychange",visibility);media.removeEventListener("change",schedule);};
 },[enabled,onChapter]);
}
