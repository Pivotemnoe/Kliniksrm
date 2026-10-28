const fs = require('node:fs');
const assert = require('node:assert/strict');
const before = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/staff-base-datamodel.json', 'utf8'));
const requireClient = require('node:module').createRequire(fs.existsSync('/app/apps/api/package.json') ? '/app/apps/api/package.json' : __filename);
const after = requireClient('@prisma/client').Prisma.dmmf.datamodel;
assert.deepEqual(after.enums, before.enums, 'Existing enums must stay unchanged');
for (const model of before.models) {
  const current = after.models.find(item => item.name === model.name);
  assert.ok(current, 'Existing model removed: ' + model.name);
  for (const field of model.fields) {
    assert.deepEqual(current.fields.find(item => item.name === field.name), field, 'Existing field changed: ' + model.name + '.' + field.name);
  }
  for (const field of current.fields.filter(item => !model.fields.some(old => old.name === item.name))) {
    assert.ok((model.name === 'InternalMessage' && field.name === 'clientKey' && field.type === 'String' && !field.isRequired)
      || (field.kind === 'object' && field.type.startsWith('Staff')), 'Unexpected added field: ' + model.name + '.' + field.name);
  }
  assert.deepEqual(current.primaryKey, model.primaryKey, 'Existing primary key changed: ' + model.name);
  for (const unique of model.uniqueFields) assert.ok(current.uniqueFields.some(item => JSON.stringify(item) === JSON.stringify(unique)));
}
assert.deepEqual(after.models.filter(item => !before.models.some(old => old.name === item.name)).map(item => item.name).sort(),
  ['StaffClinicChannel', 'StaffClinicChatMembership', 'StaffClinicChatMessage', 'StaffNativePushDelivery', 'StaffNativePushDevice', 'StaffNativePushEvent']);
console.log('Existing CRM models preserved; only reviewed staff models and nullable message key added.');
