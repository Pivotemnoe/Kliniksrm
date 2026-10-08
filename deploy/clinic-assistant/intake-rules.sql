-- User-approved 08.10.2026: any active doctor, 30-minute primary intake;
-- follow-up within one month. Rooms are internal resources, never owner choices.
BEGIN;
LOCK TABLE "AssistantBookingRule" IN SHARE ROW EXCLUSIVE MODE;
DO $configure$
DECLARE office_id text; service_count integer; doctor_count integer; room_count integer; inserted_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM "AssistantBookingRule") THEN RAISE EXCEPTION 'Booking rules changed; inspect before configuration'; END IF;
  SELECT id INTO STRICT office_id FROM "ClinicOffice" WHERE name='Основная клиника' AND timezone='Europe/Moscow';
  SELECT count(*) INTO service_count FROM "Service" WHERE "isActive" AND "publicOnWebsite" AND title IN ('Первичный прием врача','Повторный приём врача');
  IF service_count<>2 THEN RAISE EXCEPTION 'Approved published intake services are ambiguous'; END IF;
  SELECT count(*) INTO doctor_count FROM "Employee" e WHERE e.status='ACTIVE' AND EXISTS (SELECT 1 FROM "EmployeeRole" er JOIN "Role" r ON r.id=er."roleId" WHERE er."employeeId"=e.id AND r.code='doctor');
  SELECT count(*) INTO room_count FROM "Room" WHERE "officeId"=office_id AND name IN ('Приемная 1','Приемная 2');
  IF doctor_count<1 OR doctor_count>50 OR room_count<>2 THEN RAISE EXCEPTION 'Intake resources changed'; END IF;
  INSERT INTO "AssistantBookingRule" (id,"officeId","serviceId","employeeId","roomId","isActive","durationMinutes","stepMinutes","minimumLeadMinutes","maximumDaysAhead",version,"createdAt","updatedAt")
  SELECT gen_random_uuid()::text,office_id,s.id,e.id,r.id,true,30,30,30,14,1,now(),now()
  FROM "Service" s CROSS JOIN "Employee" e CROSS JOIN "Room" r
  WHERE s."isActive" AND s."publicOnWebsite" AND s.title IN ('Первичный прием врача','Повторный приём врача')
    AND e.status='ACTIVE' AND EXISTS (SELECT 1 FROM "EmployeeRole" er JOIN "Role" role ON role.id=er."roleId" WHERE er."employeeId"=e.id AND role.code='doctor')
    AND r."officeId"=office_id AND r.name IN ('Приемная 1','Приемная 2');
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count<>doctor_count*room_count*2 THEN RAISE EXCEPTION 'Incomplete intake setup'; END IF;
  INSERT INTO "AuditLog" (id,action,"entityType",metadata,"createdAt") VALUES
    (gen_random_uuid()::text,'assistant_booking.configure_intake','AssistantBookingRule',jsonb_build_object('source','owner_instruction_20261008','durationMinutes',30,'doctors',doctor_count,'rules',inserted_count,'repeatPolicy','one_calendar_month'),now());
END $configure$;
SELECT 'active_intake_rules' AS kind,count(*) FROM "AssistantBookingRule" WHERE "isActive";
COMMIT;
