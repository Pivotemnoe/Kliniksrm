// Explicit candidate-only merge of the reviewed PWA guards and the duration/calendar release.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder = new URL('../ServerAdapter/grooming-duration/', import.meta.url);
const path = 'apps/api/src/modules/grooming/grooming.service.ts';
const target = new URL('merged/' + path, folder);
let text = await readFile(target, 'utf8'), count = 0;
text = text.replace(/<<<<<<<[^\n]*\n([\s\S]*?)\|\|\|\|\|\|\|[^\n]*\n[\s\S]*?=======\n([\s\S]*?)>>>>>>>[^\n]*\n/g, (_match, pwa, grooming) => {
  count++;
  if (pwa.startsWith('type Offer')) return grooming.replace('staff: boolean;', 'staff: boolean; actorId?: string;');
  if (pwa.includes('assertStaffClientAccess')) return grooming.replace("if (actor && !this.manager(actor)) throw new ForbiddenException('Создавать записи может администратор');", "if (actor && !this.manager(actor)) await this.assertStaffClientAccess(actor, ownerId, input.clientAccessToken);\n    if (input.species === 'DOG' && input.size === 'ANY') throw new BadRequestException('Укажите размер собаки');\n    if (input.reservationId) await this.editable(input.reservationId, ownerId, actor);");
  if (pwa.includes("Можно записывать только к себе")) return "      if (actor && !this.manager(actor) && rule.specialist.employeeId !== actor.id) throw new ForbiddenException('Можно записывать только к себе');\n";
  return grooming;
});
if (count !== 5 || text.includes('<<<<<<<')) throw new Error('Unexpected integration conflict shape');
text = text.replace('this.availableSlots(input, now, Boolean(actor), minimumDuration)', 'this.availableSlots(input, now, Boolean(actor), minimumDuration, actor)')
 .replace('private async availableSlots(input: GroomingOptionsDto, now: Date, staff: boolean, minimumDuration = 90)', 'private async availableSlots(input: GroomingOptionsDto, now: Date, staff: boolean, minimumDuration = 90, actor?: AuthEmployee)')
 .replace('staff: Boolean(actor), ...(rule.followShiftWorkplace', 'staff: Boolean(actor), actorId: actor?.id, ...(rule.followShiftWorkplace');
const start = text.indexOf('private async availableSlots('), end = text.indexOf('private async conflict(', start);
if (start < 0 || end < 0) throw new Error('Slot function not found');
const slots = text.slice(start, end).replace('...(input.specialistId ? { specialistId: input.specialistId } : {})', '...(input.specialistId ? { specialistId: input.specialistId } : {}), ...(actor && !this.manager(actor) ? { specialist: { employeeId: actor.id } } : {})');
text = text.slice(0, start) + slots + text.slice(end);
for (const marker of ['issueStaffClientAccess', 'assertStaffClientAccess(actor, ownerId, input.clientAccessToken)', "offer.actorId !== actor.id", "Можно записывать только к себе", 'adjustDuration', 'followShiftWorkplace']) if (!text.includes(marker)) throw new Error('Required guard/feature missing: ' + marker);
await writeFile(target, text);
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder)));
manifest.files.find(file => file.path === path).mergedSha256 = createHash('sha256').update(text).digest('hex');
manifest.integrationResolutions = ['PWA client access tokens preserved', 'offers bound to issuing employee', 'groomer slots and booking restricted to self', 'calendar workplace and duration checks retained'];
await writeFile(new URL('manifest.json', folder), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ resolvedCandidateConflicts: count, retainedMobileGuards: true }));
