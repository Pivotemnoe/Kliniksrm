const TTL=30*60*1000;
const key=module=>'temichevvet-booking-attribution-v1:'+module;

export function normalizeAttribution(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='listingId,source')return undefined;
 return value.source==='AVITO'&&typeof value.listingId==='string'&&/^[1-9]\d{0,19}$/.test(value.listingId)
  ?{source:'AVITO',listingId:value.listingId}:undefined;
}

export function captureAttribution({module,search='',storage,now=Date.now()}) {
 if(!['GROOMING','PET_HOTEL'].includes(module))return undefined;
 const params=new URLSearchParams(search),explicit=params.has('utm_source')||params.has('listing_id');
 const remove=()=>{try{storage?.removeItem(key(module));}catch{}};
 if(explicit){
  const value=params.getAll('utm_source').length===1&&params.getAll('listing_id').length===1&&params.get('utm_source')==='avito'
   ?normalizeAttribution({source:'AVITO',listingId:params.get('listing_id')}):undefined;
  if(value){try{storage?.setItem(key(module),JSON.stringify({value,capturedAt:now}));}catch{}return value;}
  remove();return undefined;
 }
 try{
  const saved=JSON.parse(storage?.getItem(key(module))||'null'),value=normalizeAttribution(saved?.value);
  if(value&&Number.isFinite(saved.capturedAt)&&saved.capturedAt<=now&&now-saved.capturedAt<TTL)return value;
 }catch{}
 remove();return undefined;
}

export function browserAttribution(module) {
 if(typeof window==='undefined')return undefined;
 let storage;try{storage=window.sessionStorage;}catch{}
 return captureAttribution({module,search:window.location.search,storage});
}
