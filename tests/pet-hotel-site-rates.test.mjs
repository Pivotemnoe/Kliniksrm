import assert from 'node:assert/strict';
import test from 'node:test';
import {minimumRoomRate} from '../prototypes/temichevvet-pet-hotel-20261020/public/pet-hotel/rates.js';

const rooms=[{species:'CAT',dailyRate:'900.00'},{species:'CAT',dailyRate:'1200.00'},
 {species:'DOG',dailyRate:'1100.00'},{species:'CAT',dailyRate:'100.00',isActive:false}];

test('preliminary rates respect individual active rooms and the selected animal',()=>{
 assert.equal(minimumRoomRate(rooms,'CAT','700.00'),900);
 assert.equal(minimumRoomRate(rooms,'DOG','700.00'),1100);
 assert.equal(minimumRoomRate(rooms,null,'700.00'),900);
});
test('missing or malformed room rates use the explicit catalogue fallback',()=>{
 assert.equal(minimumRoomRate(undefined,'CAT','700.00'),700);
 for(const dailyRate of [null,undefined,'','  ','invalid',NaN,Infinity,-1,false,[],{}])
  assert.equal(minimumRoomRate([{species:'CAT',dailyRate}], 'CAT','700.00'),700);
});
test('an explicit zero room rate is valid and differs from a missing price',()=>{
 for(const dailyRate of [0,'0','0.00'])
  assert.equal(minimumRoomRate([{species:'CAT',dailyRate}], 'CAT','700.00'),0);
 assert.equal(minimumRoomRate([...rooms,{species:'CAT',dailyRate:0}],null,700),0);
});
test('new catalogue prices are used without altering the room objects',()=>{
 const updated=rooms.map((r,i)=>i===0?{...r,dailyRate:'1500.00'}:{...r});
 assert.equal(minimumRoomRate(updated,'CAT',700),1200);
 assert.equal(rooms[0].dailyRate,'900.00');
});
