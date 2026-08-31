insert into public.document_type(company_id,code,name,domain,active)
select c.id,'COMPRA','Pedidos de compra','PURCHASE',true
from public.company c where c.code='ONIN-DEMO'
on conflict(company_id,code) do nothing;

insert into public.document_series(company_id,document_type_id,code,next_number,active)
select c.id,dt.id,'COM',2,true
from public.company c
join public.document_type dt on dt.company_id=c.id and dt.code='COMPRA'
where c.code='ONIN-DEMO'
on conflict(company_id,document_type_id,code) do nothing;

insert into public.purchase_document(
  company_id,document_type_id,series_id,number,supplier_party_id,issue_date,status,reference,
  net_amount,tax_amount,total_amount,notes
)
select c.id,dt.id,ds.id,1,p.id,current_date,'DRAFT','Pedido demo de materiales',1000,210,1210,
       'Documento de demostración ONIN'
from public.company c
join public.document_type dt on dt.company_id=c.id and dt.code='COMPRA'
join public.document_series ds on ds.company_id=c.id and ds.document_type_id=dt.id and ds.code='COM'
join public.party p on p.company_id=c.id
where c.code='ONIN-DEMO'
  and p.code=(select min(code) from public.party where company_id=c.id)
  and not exists(select 1 from public.purchase_document x where x.company_id=c.id);

insert into public.purchase_document_line(
  purchase_document_id,line_no,product_id,description,quantity,unit_price,tax_percent,net_amount,tax_amount,total_amount
)
select pd.id,1,p.id,'Material de demostración',40,25,21,1000,210,1210
from public.purchase_document pd
join public.product p on p.company_id=pd.company_id
where pd.company_id=(select id from public.company where code='ONIN-DEMO')
  and p.code=(select min(code) from public.product where company_id=pd.company_id)
  and not exists(select 1 from public.purchase_document_line l where l.purchase_document_id=pd.id);
