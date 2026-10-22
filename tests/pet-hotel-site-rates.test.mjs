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
 assert.equal(minimumRoomRate([{species:'CAT',dailyRate:'invalid'},{species:'CAT',dailyRate:0}], 'CAT','700.00'),700);
});
test('new catalogue prices are used without altering the room objects',()=>{
 const updated=rooms.map((r,i)=>i===0?{...r,dailyRate:'1500.00'}:{...r});
 assert.equal(minimumRoomRate(updated,'CAT',700),1200);
 assert.equal(rooms[0].dailyRate,'900.00');
});
