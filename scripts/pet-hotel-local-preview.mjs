// Local synthetic acceptance only. No production environment or external transports.
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { configureHotelQa, hotelQaApp } from '../tests/helpers/pet-hotel-qa-app.mjs';
configureHotelQa('pet_hotel_preview_20261020_qa');
const { hotelFixture, qaPassword } = await import('../tests/helpers/pet-hotel-fixture.mjs');
const f = await hotelFixture({preview:true});
if (!await f.prisma.petHotelReservation.count()) {
  const today=new Date().toISOString().slice(0,10), start=new Date(today+'T10:00:00+03:00');
  const dog=await f.service.book(f.booking({animalId:f.dog.id,roomId:f.rooms.find(r=>r.code==='DOG-1').id,weightKg:6.5,walkCount:6,startsAt:start.toISOString(),endsAt:new Date(+start+72*3600000).toISOString(),notes:'QA: корм и миски с собой, прогулки согласованы'}),f.administrator,undefined,new Date(+start-3600000));
  await f.service.status(dog.id,{clientKey:randomUUID(),version:dog.version,status:'IN_HOUSE'},f.administrator,new Date(+start+3600000));
  await f.service.book(f.booking({notes:'QA: 2 суток и 3 часа считаются как 3 суток'}),f.administrator,undefined,f.now);
}
for(const key of ['GROOMING','avito-administrator']) {
  // This local database was copied from an already synthetic accepted stand.
  const catalog=await f.modules.catalog(), item=catalog.find(m=>m.key===key);
  if(item && !item.installation.enabled) await f.modules.setEnabled(key,true,item.installation.version,f.director.id);
}
await mkdir('output/pet-hotel-module-20261020',{recursive:true});
await writeFile('output/pet-hotel-module-20261020/preview-access.json',JSON.stringify({url:'http://127.0.0.1:4291/pet-hotel',login:f.director.email,password:qaPassword,administrator:f.administrator.email,owner:f.owner.fullName,animal:f.animal.nickname},null,2),{mode:0o600});
await f.close();
const app=await hotelQaApp(); await app.listen(4292,'127.0.0.1');
console.log('Synthetic pet hotel API ready at http://127.0.0.1:4292/api');
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await app.close();process.exit(0);});
