update public.sales_order
set status='MANUFACTURED', updated_at=now()
where company_id=(select id from public.company where code='ONIN-DEMO')
  and code='PED-2026/017';

insert into public.installation(
  company_id,customer_id,reference,order_id,installation_date,installer_id,address,postal_code,city,phone,
  start_at,end_at,estimated_minutes,actual_minutes,status,notes,created_at,updated_at,sales_order_id,
  installation_type_id,scheduled_date,start_time,end_time,estimated_duration,actual_duration,installers
)
select d.id,
       c.id,
       i.reference,
       case when i.order_id is null then null else i.order_id+1000000 end,
       i.installation_date,
       case when i.installer_id is null then null else i.installer_id+1000000 end,
       i.address,i.postal_code,i.city,i.phone,i.start_at,i.end_at,i.estimated_minutes,i.actual_minutes,
       i.status,i.notes,now(),now(),so.id,
       case when i.installation_type_id is null then null else i.installation_type_id+1000000 end,
       i.scheduled_date,i.start_time,i.end_time,i.estimated_duration,i.actual_duration,i.installers
from public.installation i
join public.sales_order src on src.id=i.sales_order_id
  and src.company_id=(select id from public.company where code='ONIN')
  and src.code='PED-2026/017'
  and src.status='MANUFACTURED'
join public.sales_order so on so.id=src.id+1000000
  and so.company_id=(select id from public.company where code='ONIN-DEMO')
left join public.customer c on c.id=i.customer_id+1000000
cross join public.company d
where d.id=(select id from public.company where code='ONIN-DEMO')
  and not exists(select 1 from public.installation x where x.company_id=d.id and x.sales_order_id=so.id)
limit 1;
