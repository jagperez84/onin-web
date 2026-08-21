create or replace function public.normalize_otd_component_increment()
returns trigger
language plpgsql
as $$
begin
  if new.price_increment < 0 then
    new.price_increment_type := 'PERCENTAGE';
    new.price_increment := abs(new.price_increment);
  elsif coalesce(new.price_increment_type, 'FIXED') = 'PERCENTAGE' then
    new.price_increment := greatest(new.price_increment, 0);
  else
    new.price_increment_type := 'FIXED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_otd_component_increment on public.otd_component;
create trigger trg_normalize_otd_component_increment
before insert or update of price_increment, price_increment_type on public.otd_component
for each row execute function public.normalize_otd_component_increment();
