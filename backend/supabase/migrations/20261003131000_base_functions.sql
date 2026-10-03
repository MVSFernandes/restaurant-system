-- Canonical application functions captured from the live Supabase catalog.
begin;

set local search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.add_credit_charge(p_credit_tx_id text, p_customer_id text, p_amount numeric, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer public.customers%rowtype;
  v_tx public.credit_transactions%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  if v_customer.credit_limit > 0
     and coalesce(v_customer.credit_used, 0) + p_amount > v_customer.credit_limit then
    raise exception 'Credit limit exceeded' using errcode = 'P0001';
  end if;

  update public.customers
  set credit_used = coalesce(credit_used, 0) + p_amount,
      updated_at = now()
  where id = p_customer_id;

  insert into public.credit_transactions (
    id,
    customer_id,
    type,
    amount,
    description,
    status,
    settled_amount
  )
  values (
    p_credit_tx_id,
    p_customer_id,
    'CHARGE',
    p_amount,
    p_description,
    'OPEN',
    0
  )
  returning * into v_tx;

  return to_jsonb(v_tx);
end;
$function$;

CREATE OR REPLACE FUNCTION public.block_cash_close_with_pending_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pending_orders jsonb;
  open_tabs jsonb;
begin
  if old.status is distinct from 'CLOSED' and new.status = 'CLOSED' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', tab.id,
          'tableId', tab.table_id,
          'name', tab.name
        ) order by tab.opened_at, tab.id
      ),
      '[]'::jsonb
    )
    into open_tabs
    from public.table_tabs as tab
    where tab.cash_register_session_id = new.id
      and tab.status = 'OPEN';

    if jsonb_array_length(open_tabs) > 0 then
      raise exception 'CASH_REGISTER_OPEN_TABS'
        using errcode = 'P0001', detail = open_tabs::text;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', orders.id,
          'type', orders.type,
          'orderStatus', orders.status,
          'total', orders.total,
          'paymentStatus', payment.status,
          'paymentMethod', payment.method
        ) order by orders.created_at asc
      ),
      '[]'::jsonb
    )
    into pending_orders
    from public.orders as orders
    left join public.payments as payment on payment.order_id = orders.id
    where orders.cash_register_session_id = new.id
      and orders.status <> 'CANCELED'
      and (
        orders.status <> 'FINISHED'
        or payment.id is null
        or payment.status in ('PENDING', 'FAILED')
      );

    if jsonb_array_length(pending_orders) > 0 then
      raise exception 'CASH_REGISTER_PENDING_ORDERS'
        using errcode = 'P0001', detail = pending_orders::text;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_pending_payments_with_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.payments
  set status = 'CANCELED'
  where order_id = new.id
    and status = 'PENDING';

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_empty_implicit_table_tab_after_order_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.table_tab_id is not null
     and not exists (
       select 1 from public.orders
       where table_tab_id = old.table_tab_id
     ) then
    update public.table_tabs
    set
      status = 'CLOSED',
      closed_by_id = coalesce(old.waiter_id, old.user_id),
      closed_at = now(),
      updated_at = now()
    where id = old.table_tab_id
      and status = 'OPEN'
      and name = 'Não registrado';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_settled_table_tab_after_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_setting('app.closing_table_tab', true) is distinct from '1'
     and new.table_tab_id is not null
     and new.status in ('FINISHED', 'CANCELED')
     and old.status is distinct from new.status
     and not exists (
       select 1 from public.orders
       where table_tab_id = new.table_tab_id
         and status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
     )
     and not exists (
       select 1
       from public.orders as order_row
       where order_row.table_tab_id = new.table_tab_id
         and order_row.status <> 'CANCELED'
         and not exists (
           select 1 from public.payments as payment
           where payment.order_id = order_row.id and payment.status = 'PAID'
         )
     ) then
    update public.table_tabs
    set
      status = 'CLOSED',
      closed_by_id = coalesce(new.waiter_id, new.user_id),
      closed_at = now(),
      updated_at = now()
    where id = new.table_tab_id
      and status = 'OPEN';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_table_tab(p_table_tab_id text, p_payment_method text, p_customer_id text, p_closed_by_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tab public.table_tabs%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_unpaid_total numeric := 0;
  v_unpaid_count integer := 0;
  v_payment_id text;
  v_credit_id text;
begin
  select * into v_tab
  from public.table_tabs
  where id = p_table_tab_id
  for update;

  if not found then
    raise exception 'TABLE_TAB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tab.status = 'CLOSED' then
    return to_jsonb(v_tab);
  end if;

  select coalesce(sum(order_row.total), 0), count(*)
  into v_unpaid_total, v_unpaid_count
  from public.orders as order_row
  where order_row.table_tab_id = v_tab.id
    and order_row.status <> 'CANCELED'
    and not exists (
      select 1 from public.payments as payment
      where payment.order_id = order_row.id and payment.status = 'PAID'
    );

  if v_unpaid_count > 0 and p_payment_method is null then
    raise exception 'TABLE_TAB_PAYMENT_METHOD_REQUIRED' using errcode = 'P0001';
  end if;

  if p_payment_method is not null
     and p_payment_method not in ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CREDIT') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;

  if p_payment_method = 'CREDIT' then
    if p_customer_id is null then
      raise exception 'TABLE_TAB_CUSTOMER_REQUIRED' using errcode = 'P0001';
    end if;

    select * into v_customer
    from public.customers
    where id = p_customer_id
    for update;

    if not found then
      raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_customer.credit_used + v_unpaid_total > v_customer.credit_limit then
      raise exception 'CREDIT_LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;

    update public.customers
    set credit_used = credit_used + v_unpaid_total,
        updated_at = now()
    where id = p_customer_id;
  end if;

  perform set_config('app.closing_table_tab', '1', true);

  update public.orders as order_row
  set status = 'FINISHED', updated_at = now()
  where order_row.table_tab_id = v_tab.id
    and order_row.status <> 'CANCELED'
    and exists (
      select 1 from public.payments as payment
      where payment.order_id = order_row.id and payment.status = 'PAID'
    );

  for v_order in
    select order_row.*
    from public.orders as order_row
    where order_row.table_tab_id = v_tab.id
      and order_row.status <> 'CANCELED'
      and not exists (
        select 1 from public.payments as payment
        where payment.order_id = order_row.id and payment.status = 'PAID'
      )
    order by order_row.created_at, order_row.id
    for update
  loop
    v_payment_id := 'pay_' || substr(md5(random()::text || clock_timestamp()::text || v_order.id), 1, 24);

    insert into public.payments (
      id, order_id, method, amount, status, transaction_id, created_at
    ) values (
      v_payment_id, v_order.id, p_payment_method, v_order.total, 'PAID', null, now()
    )
    on conflict (order_id) do update
    set method = excluded.method,
        amount = excluded.amount,
        status = 'PAID';

    if p_payment_method = 'CREDIT' and not exists (
      select 1 from public.credit_transactions
      where order_id = v_order.id and type = 'CHARGE'
    ) then
      v_credit_id := 'ctx_' || substr(md5(random()::text || clock_timestamp()::text || v_order.id), 1, 24);
      insert into public.credit_transactions (
        id, type, amount, description, customer_id, order_id,
        status, settled_amount, settled_at, created_at
      ) values (
        v_credit_id,
        'CHARGE',
        v_order.total,
        'Comanda ' || v_tab.name || ' - pedido ' || v_order.id,
        p_customer_id,
        v_order.id,
        'OPEN',
        0,
        null,
        now()
      );
    end if;

    update public.orders
    set status = 'FINISHED',
        customer_id = case when p_payment_method = 'CREDIT' then p_customer_id else customer_id end,
        updated_at = now()
    where id = v_order.id;
  end loop;

  update public.table_tabs
  set status = 'CLOSED',
      closed_by_id = p_closed_by_id,
      closed_at = now(),
      updated_at = now()
  where id = v_tab.id
    and status = 'OPEN'
  returning * into v_tab;

  if not found then
    select * into v_tab from public.table_tabs where id = p_table_tab_id;
  end if;

  return to_jsonb(v_tab);
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_order_stock(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item               jsonb;
  v_product            products%ROWTYPE;
  v_psi                product_stock_items%ROWTYPE;
  v_multiplier         numeric;
  v_decrement          numeric;
  v_items_processed    integer := 0;
  v_updates_count      integer := 0;
  v_failing_stock_id   text;
  v_failing_stock_name text;
BEGIN
  -- Sem itens? nada pra fazer
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('items_processed', 0, 'updates_count', 0);
  END IF;

  -- Itera cada item do pedido
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Busca o produto
    SELECT * INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado: %', (v_item->>'product_id')
        USING ERRCODE = 'P0002';
    END IF;

    -- Calcula multiplicador conforme tipo de venda
    IF v_product.is_by_weight THEN
      v_multiplier := COALESCE((v_item->>'weight')::numeric, 0) / 1000.0;
    ELSE
      v_multiplier := COALESCE((v_item->>'quantity')::numeric, 1);
    END IF;

    -- Multiplicador zero/negativo não consome nada (item sem peso/quantidade)
    IF v_multiplier <= 0 THEN
      v_items_processed := v_items_processed + 1;
      CONTINUE;
    END IF;

    -- Itera os vínculos de estoque do produto (receita)
    FOR v_psi IN
      SELECT * FROM product_stock_items WHERE product_id = v_product.id
    LOOP
      v_decrement := v_psi.quantity * v_multiplier;

      -- Decrementa estoque com lock implícito do UPDATE
      BEGIN
        UPDATE stock_items
           SET quantity = quantity - v_decrement
         WHERE id = v_psi.stock_item_id;

        v_updates_count := v_updates_count + 1;
      EXCEPTION
        WHEN check_violation THEN
          -- Estoque ficaria negativo — captura nome do insumo pra mensagem clara
          SELECT id, name INTO v_failing_stock_id, v_failing_stock_name
            FROM stock_items WHERE id = v_psi.stock_item_id;
          RAISE EXCEPTION 'Estoque insuficiente do insumo "%" (id=%) para o produto "%"',
            v_failing_stock_name, v_failing_stock_id, v_product.name
            USING ERRCODE = 'P0001';
      END;
    END LOOP;

    v_items_processed := v_items_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'items_processed', v_items_processed,
    'updates_count',   v_updates_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_with_stock(p_order jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_stock record;
  v_paused_product_name text;
begin
  if nullif(p_order->>'id', '') is null then
    raise exception 'Identificador do pedido obrigatório';
  end if;
  -- Scoped key is stored independently from the human-facing CUID.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(nullif(p_order->>'idempotency_key', ''), p_order->>'id'), 0));
  if nullif(p_order->>'idempotency_key', '') is not null then
    select * into v_order from public.orders where idempotency_key = p_order->>'idempotency_key';
    if found then return to_jsonb(v_order); end if;
  end if;
  select * into v_order from public.orders where id = p_order->>'id';
  if found then return to_jsonb(v_order); end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Adicione itens ao pedido';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione itens ao pedido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce((i->>'quantity')::numeric, 0) <= 0
       or ((i->>'weight') is not null and (i->>'weight')::numeric <= 0)
       or i->>'order_id' is distinct from p_order->>'id'
  ) then
    raise exception 'Itens ou quantidades inválidos';
  end if;

  -- Serialize pause changes with order creation for every referenced product.
  perform 1
  from public.products as product
  where product.id in (
    select item->>'product_id' from jsonb_array_elements(p_items) as item
  )
  order by product.id
  for update;

  select product.name
  into v_paused_product_name
  from public.products as product
  where product.is_paused
    and product.id in (
      select item->>'product_id' from jsonb_array_elements(p_items) as item
    )
  order by product.name
  limit 1;

  if found then
    raise exception 'O produto "%" está pausado.', v_paused_product_name
      using errcode = 'P0001';
  end if;

  -- Lock shared ingredients in a consistent order before checking/consuming.
  -- Keep the existing stock RPC's weight/unit conversion rules.
  for v_stock in
    select s.id, s.name, s.quantity from public.stock_items s
    where s.id in (
      select l.stock_item_id from public.product_stock_items l
      join jsonb_array_elements(p_items) i on l.product_id = i->>'product_id'
    )
    order by s.id for update
  loop
    if exists (
      select 1 from public.product_stock_items l
      join jsonb_array_elements(p_items) i on l.product_id = i->>'product_id'
      where l.stock_item_id = v_stock.id and l.quantity > v_stock.quantity
    ) then
      raise exception 'Estoque insuficiente de "%"', v_stock.name;
    end if;
  end loop;

  perform public.consume_order_stock(p_items);

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders,
    p_order || jsonb_build_object('created_at', now(), 'updated_at', now()))
  returning * into v_order;

  insert into public.order_items
  select * from jsonb_populate_recordset(null::public.order_items, p_items);

  if v_order.type = 'DINE_IN' and v_order.table_id is not null then
    update public.tables set status = 'OCCUPIED' where id = v_order.table_id;
  end if;

  if p_payment is not null and p_payment <> 'null'::jsonb then
    if p_payment->>'order_id' is distinct from v_order.id then
      raise exception 'Pagamento não pertence ao pedido';
    end if;
    insert into public.payments
    select * from jsonb_populate_record(null::public.payments,
      p_payment || jsonb_build_object('created_at', now()));
  end if;
  return to_jsonb(v_order);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_report(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_total_revenue      numeric;
  v_total_orders       integer;
  v_total_expenses     numeric;
  v_total_withdrawals  numeric;
  v_top_products       jsonb;
  v_top_customers      jsonb;
  v_payment_methods    jsonb;
BEGIN
  -- 1. Receita total + número de pedidos (somente pedidos não-cancelados no período)
  SELECT
    COALESCE(SUM(o.total), 0),
    COUNT(*)
  INTO v_total_revenue, v_total_orders
  FROM orders o
  WHERE o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status <> 'CANCELED';

  -- 2. Despesas totais (contas pagas no período)
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_expenses
    FROM payable_accounts
   WHERE paid = true
     AND paid_at >= p_start_date
     AND paid_at <= p_end_date;

  -- 3. Sangrias totais no período
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_withdrawals
    FROM cash_withdrawals
   WHERE created_at >= p_start_date
     AND created_at <= p_end_date;

  -- 4. Top 5 produtos (mais vendidos por receita)
  SELECT COALESCE(jsonb_agg(produto), '[]'::jsonb)
    INTO v_top_products
    FROM (
      SELECT jsonb_build_object(
        'product_id', p.id,
        'name',       p.name,
        'quantity',   SUM(oi.quantity),
        'revenue',    SUM(oi.price)
      ) AS produto
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders   o ON o.id = oi.order_id
     WHERE o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status <> 'CANCELED'
     GROUP BY p.id, p.name
     ORDER BY SUM(oi.price) DESC
     LIMIT 5
    ) sub;

  -- 5. Top 5 clientes (mais gastaram)
  SELECT COALESCE(jsonb_agg(cliente), '[]'::jsonb)
    INTO v_top_customers
    FROM (
      SELECT jsonb_build_object(
        'customer_id', c.id,
        'name',        c.name,
        'total_spent', SUM(o.total),
        'order_count', COUNT(*)
      ) AS cliente
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
     WHERE o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status <> 'CANCELED'
       AND o.customer_id IS NOT NULL
     GROUP BY c.id, c.name
     ORDER BY SUM(o.total) DESC
     LIMIT 5
    ) sub;

  -- 6. Total por método de pagamento
  SELECT COALESCE(jsonb_object_agg(method, total_amount), '{}'::jsonb)
    INTO v_payment_methods
    FROM (
      SELECT
        pay.method,
        SUM(pay.amount) AS total_amount
        FROM payments pay
        JOIN orders o ON o.id = pay.order_id
       WHERE pay.status = 'PAID'
         AND o.created_at >= p_start_date
         AND o.created_at <= p_end_date
         AND o.status <> 'CANCELED'
       GROUP BY pay.method
    ) sub;

  -- 7. Monta JSON final
  RETURN jsonb_build_object(
    'total_revenue',     v_total_revenue,
    'total_expenses',    v_total_expenses,
    'total_withdrawals', v_total_withdrawals,
    'net_profit',        v_total_revenue - v_total_expenses,
    'total_orders',      v_total_orders,
    'top_products',      v_top_products,
    'top_customers',     v_top_customers,
    'payment_methods',   v_payment_methods
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_table_tab(p_id text, p_table_id text, p_cash_register_session_id text, p_name text, p_opened_by_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table public.tables%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_tab public.table_tabs%rowtype;
  v_name text := btrim(p_name);
begin
  if nullif(v_name, '') is null then
    raise exception 'TABLE_TAB_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_table.status not in ('AVAILABLE', 'OCCUPIED') then
    raise exception 'TABLE_NOT_AVAILABLE_FOR_TAB' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.cash_register_sessions
  where id = p_cash_register_session_id
  for update;

  if not found or v_session.status <> 'OPEN' then
    raise exception 'CASH_REGISTER_CLOSED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.table_tabs
    where table_id = p_table_id
      and status = 'OPEN'
      and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'TABLE_TAB_NAME_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  if v_table.status = 'AVAILABLE' then
    update public.tables
    set status = 'OCCUPIED'
    where id = p_table_id;
  end if;

  insert into public.table_tabs (
    id,
    table_id,
    cash_register_session_id,
    name,
    status,
    opened_by_id,
    closed_by_id,
    opened_at,
    closed_at,
    updated_at
  ) values (
    p_id,
    p_table_id,
    p_cash_register_session_id,
    v_name,
    'OPEN',
    p_opened_by_id,
    null,
    now(),
    null,
    now()
  )
  returning * into v_tab;

  return to_jsonb(v_tab);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_customer_credit(p_credit_tx_id text, p_customer_id text, p_amount numeric, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer public.customers%rowtype;
  v_payment public.credit_transactions%rowtype;
  v_charge public.credit_transactions%rowtype;
  v_remaining numeric;
  v_effective_amount numeric;
  v_open_amount numeric;
  v_alloc numeric;
  v_new_settled_amount numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  v_effective_amount := least(p_amount, greatest(coalesce(v_customer.credit_used, 0), 0));

  if v_effective_amount <= 0 then
    raise exception 'Customer has no open credit balance' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (
    id,
    customer_id,
    type,
    amount,
    description,
    status,
    settled_amount,
    settled_at
  )
  values (
    p_credit_tx_id,
    p_customer_id,
    'PAYMENT',
    v_effective_amount,
    p_description,
    'PAID',
    v_effective_amount,
    now()
  )
  returning * into v_payment;

  v_remaining := v_effective_amount;

  for v_charge in
    select *
    from public.credit_transactions
    where customer_id = p_customer_id
      and type = 'CHARGE'
      and status in ('OPEN', 'PARTIAL')
    order by created_at asc, id asc
    for update
  loop
    v_open_amount := greatest(v_charge.amount - coalesce(v_charge.settled_amount, 0), 0);
    v_alloc := least(v_remaining, v_open_amount);

    if v_alloc > 0 then
      insert into public.credit_settlements (id, charge_id, payment_id, amount)
      values ('cset_' || replace(gen_random_uuid()::text, '-', ''), v_charge.id, v_payment.id, v_alloc);

      v_new_settled_amount := coalesce(v_charge.settled_amount, 0) + v_alloc;

      update public.credit_transactions
      set settled_amount = v_new_settled_amount,
          status = case
            when v_new_settled_amount >= amount then 'PAID'
            else 'PARTIAL'
          end,
          settled_at = case
            when v_new_settled_amount >= amount then now()
            else null
          end
      where id = v_charge.id;

      v_remaining := v_remaining - v_alloc;
    end if;

    exit when v_remaining <= 0;
  end loop;

  update public.customers
  set credit_used = greatest(0, coalesce(credit_used, 0) - v_effective_amount),
      updated_at = now()
  where id = p_customer_id;

  return to_jsonb(v_payment);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_order_with_credit(p_order_id text, p_customer_id text, p_credit_tx_id text, p_payment_id text, p_method text, p_amount numeric, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer record;
  v_order record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_customer.credit_used + p_amount > v_customer.credit_limit then
    raise exception 'CREDIT_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update customers
     set credit_used = credit_used + p_amount,
         updated_at = now()
   where id = p_customer_id;

  insert into credit_transactions
    (id, type, amount, description, customer_id, order_id, status, settled_amount, created_at)
  values
    (p_credit_tx_id, 'CHARGE', p_amount, p_description, p_customer_id, p_order_id, 'OPEN', 0, now());

  insert into payments (id, order_id, method, amount, status, created_at)
  values (p_payment_id, p_order_id, p_method, p_amount, 'PAID', now());

  update orders set status = 'FINISHED', updated_at = now()
  where id = p_order_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_table_release_with_open_tabs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'OCCUPIED'
     and new.status = 'AVAILABLE'
     and exists (
       select 1 from public.table_tabs
       where table_id = new.id and status = 'OPEN'
     ) then
    raise exception 'TABLE_HAS_OPEN_TABS' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_table_after_last_tab()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'CLOSED'
     and old.status is distinct from 'CLOSED'
     and not exists (
       select 1 from public.table_tabs
       where table_id = new.table_id and status = 'OPEN'
     ) then
    update public.tables
    set status = 'AVAILABLE'
    where id = new.table_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_product_stock_links(p_product_id text, p_links jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_link              jsonb;
  v_count_inserted    integer := 0;
  v_count_deleted     integer;
BEGIN
  -- 1. Verifica que o produto existe
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_product_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Apaga TODOS os vínculos antigos do produto
  DELETE FROM product_stock_items
   WHERE product_id = p_product_id;

  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;

  -- 3. Se não veio nenhum link novo, encerra (deixa produto sem vínculos)
  IF p_links IS NULL OR jsonb_array_length(p_links) = 0 THEN
    RETURN jsonb_build_object(
      'product_id',      p_product_id,
      'deleted',         v_count_deleted,
      'inserted',        0
    );
  END IF;

  -- 4. Insere todos os novos vínculos
  FOR v_link IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    -- Validação básica de cada link
    IF (v_link->>'stock_item_id') IS NULL THEN
      RAISE EXCEPTION 'Link inválido: stock_item_id ausente em %', v_link
        USING ERRCODE = 'P0001';
    END IF;

    IF (v_link->>'quantity') IS NULL OR (v_link->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Link inválido: quantity deve ser > 0 em %', v_link
        USING ERRCODE = 'P0001';
    END IF;

    -- Verifica que o item de estoque referenciado existe
    IF NOT EXISTS (SELECT 1 FROM stock_items WHERE id = (v_link->>'stock_item_id')) THEN
      RAISE EXCEPTION 'Item de estoque não encontrado: %', (v_link->>'stock_item_id')
        USING ERRCODE = 'P0002';
    END IF;

    -- Insere o vínculo (id obrigatório vindo do payload)
    INSERT INTO product_stock_items (id, product_id, stock_item_id, quantity)
    VALUES (
      v_link->>'id',
      p_product_id,
      v_link->>'stock_item_id',
      (v_link->>'quantity')::numeric
    );

    v_count_inserted := v_count_inserted + 1;
  END LOOP;

  -- 5. Retorna resumo da operação
  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'deleted',    v_count_deleted,
    'inserted',   v_count_inserted
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.require_open_tab_for_occupied_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table_id text;
  v_table_ids text[];
begin
  if tg_table_name = 'tables' then
    v_table_ids := array[coalesce(new.id, old.id)];
  elsif tg_op = 'INSERT' then
    v_table_ids := array[new.table_id];
  elsif tg_op = 'DELETE' then
    v_table_ids := array[old.table_id];
  elsif old.table_id is distinct from new.table_id then
    v_table_ids := array[old.table_id, new.table_id];
  else
    v_table_ids := array[new.table_id];
  end if;

  foreach v_table_id in array v_table_ids loop
    if exists (
      select 1
      from public.tables as table_row
      where table_row.id = v_table_id
        and table_row.status = 'OCCUPIED'
        and not exists (
          select 1
          from public.table_tabs as tab
          where tab.table_id = table_row.id
            and tab.status = 'OPEN'
        )
    ) then
      raise exception 'TABLE_OCCUPIED_REQUIRES_OPEN_TAB'
        using errcode = 'P0001';
    end if;
  end loop;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_order_stock(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item             jsonb;
  v_product          products%ROWTYPE;
  v_psi              product_stock_items%ROWTYPE;
  v_multiplier       numeric;
  v_increment        numeric;
  v_items_processed  integer := 0;
  v_updates_count    integer := 0;
BEGIN
  -- Sem itens? nada pra fazer
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('items_processed', 0, 'updates_count', 0);
  END IF;

  -- Itera cada item do pedido
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Busca o produto
    SELECT * INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado: %', (v_item->>'product_id')
        USING ERRCODE = 'P0002';
    END IF;

    -- Calcula multiplicador conforme tipo de venda
    IF v_product.is_by_weight THEN
      v_multiplier := COALESCE((v_item->>'weight')::numeric, 0) / 1000.0;
    ELSE
      v_multiplier := COALESCE((v_item->>'quantity')::numeric, 1);
    END IF;

    -- Multiplicador zero/negativo: nada a devolver
    IF v_multiplier <= 0 THEN
      v_items_processed := v_items_processed + 1;
      CONTINUE;
    END IF;

    -- Itera os vínculos de estoque do produto (receita)
    FOR v_psi IN
      SELECT * FROM product_stock_items WHERE product_id = v_product.id
    LOOP
      v_increment := v_psi.quantity * v_multiplier;

      -- Devolve ao estoque (incrementar nunca viola constraint)
      UPDATE stock_items
         SET quantity = quantity + v_increment
       WHERE id = v_psi.stock_item_id;

      v_updates_count := v_updates_count + 1;
    END LOOP;

    v_items_processed := v_items_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'items_processed', v_items_processed,
    'updates_count',   v_updates_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_order_table_tab()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tab_id text;
  v_tab_status text;
  v_table_status text;
begin
  if new.type <> 'DINE_IN' then
    if new.table_id is not null or new.table_tab_id is not null then
      raise exception 'NON_DINE_IN_ORDER_CANNOT_HAVE_TABLE_TAB' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.table_id is null then
    raise exception 'DINE_IN_ORDER_REQUIRES_TABLE' using errcode = 'P0001';
  end if;

  select status into v_table_status
  from public.tables
  where id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if new.table_tab_id is null then
    if new.cash_register_session_id is null or new.user_id is null then
      raise exception 'TABLE_TAB_CONTEXT_REQUIRED' using errcode = 'P0001';
    end if;

    if v_table_status = 'AVAILABLE' then
      update public.tables set status = 'OCCUPIED' where id = new.table_id;
    end if;

    select id into v_tab_id
    from public.table_tabs
    where table_id = new.table_id
      and status = 'OPEN'
      and lower(btrim(name)) = lower('Não registrado')
    order by opened_at
    limit 1
    for update;

    if v_tab_id is null then
      v_tab_id := 'tab_' || substr(md5(random()::text || clock_timestamp()::text || new.id), 1, 24);
      insert into public.table_tabs (
        id, table_id, cash_register_session_id, name, status, opened_by_id
      ) values (
        v_tab_id,
        new.table_id,
        new.cash_register_session_id,
        'Não registrado',
        'OPEN',
        new.user_id
      );
    end if;

    new.table_tab_id := v_tab_id;
    return new;
  end if;

  select status into v_tab_status
  from public.table_tabs
  where id = new.table_tab_id
    and table_id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_TAB_NOT_FOUND_FOR_TABLE' using errcode = 'P0002';
  end if;

  if v_table_status <> 'OCCUPIED' then
    raise exception 'TABLE_TAB_REQUIRES_OCCUPIED_TABLE' using errcode = 'P0001';
  end if;

  if v_tab_status <> 'OPEN' then
    raise exception 'TABLE_TAB_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_table_tab_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'OPEN' and new.status = 'CLOSED' and exists (
    select 1
    from public.orders as order_row
    where order_row.table_tab_id = new.id
      and order_row.status <> 'CANCELED'
      and (
        order_row.status <> 'FINISHED'
        or not exists (
          select 1 from public.payments as payment
          where payment.order_id = order_row.id
            and payment.status = 'PAID'
        )
      )
  ) then
    raise exception 'TABLE_TAB_HAS_UNPAID_ORDERS' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_table_tab_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table_status text;
begin
  new.name := btrim(new.name);

  select status into v_table_status
  from public.tables
  where id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_table_status <> 'OCCUPIED' then
    raise exception 'TABLE_TAB_REQUIRES_OCCUPIED_TABLE' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.status = 'CLOSED' then
    raise exception 'TABLE_TAB_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- Application functions are backend-only. Trigger execution does not require
-- callers to hold EXECUTE on the trigger function.
revoke all on function public.add_credit_charge(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.add_credit_charge(text, text, numeric, text) to service_role;
revoke all on function public.block_cash_close_with_pending_orders() from public, anon, authenticated;
grant execute on function public.block_cash_close_with_pending_orders() to service_role;
revoke all on function public.cancel_pending_payments_with_order() from public, anon, authenticated;
grant execute on function public.cancel_pending_payments_with_order() to service_role;
revoke all on function public.close_empty_implicit_table_tab_after_order_delete() from public, anon, authenticated;
grant execute on function public.close_empty_implicit_table_tab_after_order_delete() to service_role;
revoke all on function public.close_settled_table_tab_after_order() from public, anon, authenticated;
grant execute on function public.close_settled_table_tab_after_order() to service_role;
revoke all on function public.close_table_tab(text, text, text, text) from public, anon, authenticated;
grant execute on function public.close_table_tab(text, text, text, text) to service_role;
revoke all on function public.consume_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.consume_order_stock(jsonb) to service_role;
revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb) to service_role;
revoke all on function public.finance_report(timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.finance_report(timestamp with time zone, timestamp with time zone) to service_role;
revoke all on function public.open_table_tab(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.open_table_tab(text, text, text, text, text) to service_role;
revoke all on function public.pay_customer_credit(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.pay_customer_credit(text, text, numeric, text) to service_role;
revoke all on function public.pay_order_with_credit(text, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.pay_order_with_credit(text, text, text, text, text, numeric, text) to service_role;
revoke all on function public.prevent_table_release_with_open_tabs() from public, anon, authenticated;
grant execute on function public.prevent_table_release_with_open_tabs() to service_role;
revoke all on function public.release_table_after_last_tab() from public, anon, authenticated;
grant execute on function public.release_table_after_last_tab() to service_role;
revoke all on function public.replace_product_stock_links(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_product_stock_links(text, jsonb) to service_role;
revoke all on function public.require_open_tab_for_occupied_table() from public, anon, authenticated;
grant execute on function public.require_open_tab_for_occupied_table() to service_role;
revoke all on function public.restore_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.restore_order_stock(jsonb) to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
revoke all on function public.validate_order_table_tab() from public, anon, authenticated;
grant execute on function public.validate_order_table_tab() to service_role;
revoke all on function public.validate_table_tab_close() from public, anon, authenticated;
grant execute on function public.validate_table_tab_close() to service_role;
revoke all on function public.validate_table_tab_parent() from public, anon, authenticated;
grant execute on function public.validate_table_tab_parent() to service_role;

commit;
