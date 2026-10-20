SELECT 'Owner',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Owner" t;
SELECT 'Animal',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Animal" t;
SELECT 'Visit',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Visit" t;
SELECT 'Appointment',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Appointment" t;
SELECT 'Bill',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Bill" t;
SELECT 'Payment',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "Payment" t;
SELECT 'StockDocument',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) FROM "StockDocument" t;
SELECT 'Employee',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'accountScope'-'updatedAt')::text),'' ORDER BY id),'')) FROM "Employee" t;
