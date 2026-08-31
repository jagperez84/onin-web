insert into public.color(company_id,code,name,active)
select c.id,v.code,v.name,true from public.company c
cross join (values ('BLANCO','Blanco'),('GRIS','Gris antracita'),('BEIGE','Beige'),('GRIS-CLARO','Gris claro'),('NEGRO','Negro')) v(code,name)
where c.code='ONIN-DEMO' on conflict(company_id,code) do nothing;

insert into public.magnitude(company_id,code,name,active)
select c.id,v.code,v.name,true from public.company c
cross join (values ('LONG','Longitud'),('AREA','Superficie')) v(code,name)
where c.code='ONIN-DEMO' on conflict(company_id,code) do nothing;

insert into public.price_list(company_id,code,name,active)
select c.id,'PVP-DEMO','Tarifa PVP demostración',true from public.company c
where c.code='ONIN-DEMO' on conflict(company_id,code) do nothing;

insert into public.price_list_line(price_list_id,product_id,min_quantity,unit_price,valid_from)
select pl.id,p.id,1,coalesce(p.sales_price,0),current_date
from public.price_list pl join public.product p on p.company_id=pl.company_id
where pl.company_id=(select id from public.company where code='ONIN-DEMO') and pl.code='PVP-DEMO'
  and not exists(select 1 from public.price_list_line x where x.price_list_id=pl.id and x.product_id=p.id and x.min_quantity=1);

insert into public.commercial(company_id,party_id,active)
select p.company_id,p.id,true from public.party p
where p.company_id=(select id from public.company where code='ONIN-DEMO')
  and p.code=(select min(code) from public.party where company_id=p.company_id)
  and not exists(select 1 from public.commercial x where x.party_id=p.id);

insert into public.measurement_sequence(company_id,year,last_number)
select id,extract(year from current_date)::int,13 from public.company where code='ONIN-DEMO'
on conflict(company_id,year) do nothing;

insert into public.document_type(company_id,code,name,domain,active)
select id,'ALBARAN','Albaranes de venta','SALES',true from public.company where code='ONIN-DEMO'
on conflict(company_id,code) do nothing;

insert into public.document_series(company_id,document_type_id,code,next_number,active)
select c.id,dt.id,'ALB',2,true from public.company c
join public.document_type dt on dt.company_id=c.id and dt.code='ALBARAN'
where c.code='ONIN-DEMO' on conflict(company_id,document_type_id,code) do nothing;

insert into public.sales_document(company_id,document_type_id,series_id,number,customer_party_id,issue_date,status,reference,delivery_date,notes,net_amount,discount_amount,tax_amount,total_amount)
select c.id,dt.id,ds.id,1,p.party_id,current_date,'ISSUED','Albarán demo',null,'Documento de demostración',250,0,52.5,302.5
from public.company c
join public.document_type dt on dt.company_id=c.id and dt.code='ALBARAN'
join public.document_series ds on ds.company_id=c.id and ds.document_type_id=dt.id and ds.code='ALB'
join public.customer p on p.id=(select min(id) from public.customer where party_id in(select id from public.party where company_id=c.id))
where c.code='ONIN-DEMO' and not exists(select 1 from public.sales_document x where x.company_id=c.id);

insert into public.sales_document_line(sales_document_id,line_no,product_id,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount)
select sd.id,1,p.id,coalesce(p.commercial_description,p.code),10,25,0,21,250,52.5,302.5
from public.sales_document sd join public.product p on p.company_id=sd.company_id
where sd.company_id=(select id from public.company where code='ONIN-DEMO')
  and p.code=(select min(code) from public.product where company_id=sd.company_id)
  and not exists(select 1 from public.sales_document_line l where l.sales_document_id=sd.id);
