-- Canonical triggers and row-level security captured from the live Supabase catalog.
begin;

set local search_path = public, extensions, pg_catalog;

drop trigger if exists trg_block_cash_close_with_pending_orders on public.cash_register_sessions;
CREATE TRIGGER trg_block_cash_close_with_pending_orders BEFORE UPDATE OF status ON cash_register_sessions FOR EACH ROW EXECUTE FUNCTION block_cash_close_with_pending_orders();

drop trigger if exists trg_customers_updated_at on public.customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_marmita_updated_at on public.marmita_menu_items;
CREATE TRIGGER trg_marmita_updated_at BEFORE UPDATE ON marmita_menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_cancel_pending_payments_with_order on public.orders;
CREATE TRIGGER trg_cancel_pending_payments_with_order AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = 'CANCELED'::text AND old.status IS DISTINCT FROM 'CANCELED'::text) EXECUTE FUNCTION cancel_pending_payments_with_order();

drop trigger if exists trg_close_empty_implicit_table_tab_after_order_delete on public.orders;
CREATE TRIGGER trg_close_empty_implicit_table_tab_after_order_delete AFTER DELETE ON orders FOR EACH ROW EXECUTE FUNCTION close_empty_implicit_table_tab_after_order_delete();

drop trigger if exists trg_close_settled_table_tab_after_order on public.orders;
CREATE TRIGGER trg_close_settled_table_tab_after_order AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION close_settled_table_tab_after_order();

drop trigger if exists trg_orders_updated_at on public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_validate_order_table_tab on public.orders;
CREATE TRIGGER trg_validate_order_table_tab BEFORE INSERT OR UPDATE OF table_tab_id, table_id, type ON orders FOR EACH ROW EXECUTE FUNCTION validate_order_table_tab();

drop trigger if exists trg_payable_accounts_updated_at on public.payable_accounts;
CREATE TRIGGER trg_payable_accounts_updated_at BEFORE UPDATE ON payable_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_restaurant_config_updated_at on public.restaurant_config;
CREATE TRIGGER trg_restaurant_config_updated_at BEFORE UPDATE ON restaurant_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_stock_items_updated_at on public.stock_items;
CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_supplier_stock_items_updated_at on public.supplier_stock_items;
CREATE TRIGGER trg_supplier_stock_items_updated_at BEFORE UPDATE ON supplier_stock_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_keep_occupied_table_with_open_tab on public.table_tabs;
CREATE CONSTRAINT TRIGGER trg_keep_occupied_table_with_open_tab AFTER INSERT OR DELETE OR UPDATE OF table_id, status ON table_tabs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_open_tab_for_occupied_table();

drop trigger if exists trg_release_table_after_last_tab on public.table_tabs;
CREATE TRIGGER trg_release_table_after_last_tab AFTER UPDATE OF status ON table_tabs FOR EACH ROW EXECUTE FUNCTION release_table_after_last_tab();

drop trigger if exists trg_validate_table_tab_close on public.table_tabs;
CREATE TRIGGER trg_validate_table_tab_close BEFORE UPDATE OF status ON table_tabs FOR EACH ROW EXECUTE FUNCTION validate_table_tab_close();

drop trigger if exists trg_validate_table_tab_parent on public.table_tabs;
CREATE TRIGGER trg_validate_table_tab_parent BEFORE INSERT OR UPDATE ON table_tabs FOR EACH ROW EXECUTE FUNCTION validate_table_tab_parent();

drop trigger if exists trg_prevent_table_release_with_open_tabs on public.tables;
CREATE TRIGGER trg_prevent_table_release_with_open_tabs BEFORE UPDATE OF status ON tables FOR EACH ROW EXECUTE FUNCTION prevent_table_release_with_open_tabs();

drop trigger if exists trg_require_open_tab_for_occupied_table on public.tables;
CREATE CONSTRAINT TRIGGER trg_require_open_tab_for_occupied_table AFTER INSERT OR UPDATE OF status ON tables DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_open_tab_for_occupied_table();

drop trigger if exists trg_users_updated_at on public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS is enabled on every application table. The live catalog has no policies.
alter table public.audit_logs enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.cash_withdrawals enable row level security;
alter table public.categories enable row level security;
alter table public.credit_settlements enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.marmita_menu_items enable row level security;
alter table public.order_items enable row level security;
alter table public.orders enable row level security;
alter table public.payable_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.product_stock_items enable row level security;
alter table public.products enable row level security;
alter table public.restaurant_config enable row level security;
alter table public.stock_items enable row level security;
alter table public.supplier_stock_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.table_tabs enable row level security;
alter table public.tables enable row level security;
alter table public.users enable row level security;

commit;

-- The extension version is reported separately because Supabase may install a
-- different minor extension version on PostgreSQL 17.11 than on 17.6.
with expected_objects(category, object_key, definition_hash) as (
  values
    ('tables', 'audit_logs', '409b51e15db789546829880710c0bef4'),
    ('tables', 'cash_register_sessions', 'e4a6ae91905ffbb7754857e8ac54944a'),
    ('tables', 'cash_withdrawals', 'a7b1285a292c52c8f1b0d71755ca800e'),
    ('tables', 'categories', 'b0b5ccb4a195a07fd3eed14affb8695f'),
    ('tables', 'credit_settlements', 'd79a94439ef3c29c282237608127e09b'),
    ('tables', 'credit_transactions', 'b770cf36e2902352a6772861a0666cab'),
    ('tables', 'customers', '4b6f7d34a58ba399f077685951d06738'),
    ('tables', 'invoices', '56deca22a707214865f7ea3ae6391d67'),
    ('tables', 'marmita_menu_items', 'db6358e872fafdfeaf82ed22fde5f45b'),
    ('tables', 'order_items', 'e759f18f45d712ba4707babc1a13f9e9'),
    ('tables', 'orders', '12c500ed0b7879105fb46af0f246be87'),
    ('tables', 'payable_accounts', '648fc70bf792b1f594f89c04d4abd312'),
    ('tables', 'payments', '84d5eaf713c96eecb3d2c4a83e64dc9a'),
    ('tables', 'product_stock_items', '477cae143e2b0f4960b477bf1a592653'),
    ('tables', 'products', '86024cad1e83101d97359d7351051156'),
    ('tables', 'restaurant_config', 'd1efcd0587fb66610954d3dce570753e'),
    ('tables', 'stock_items', '0559c750861113177cd7ee43ca135f8a'),
    ('tables', 'supplier_stock_items', 'e07b5e9fbbd9931cc195fead7cae16af'),
    ('tables', 'suppliers', 'd9ddf16079b7ba158c82e819d2c363d1'),
    ('tables', 'table_tabs', 'a3e1815deea3375a7d38f58d38492730'),
    ('tables', 'tables', '9ab2ec7ea4a2041306f7bdf150fcd453'),
    ('tables', 'users', '9bc65c2abec141778ffaa729489f3e87'),
    ('columns', 'audit_logs.id', '777d1a8670836823bb170043caf3738c'),
    ('columns', 'audit_logs.action', 'a43cc2e343c49a6294107dd97b8abfae'),
    ('columns', 'audit_logs.entity', '7dd60deaf900c0d0088b7783aea257e9'),
    ('columns', 'audit_logs.entity_id', 'a804ddff9260e671c081b12b3f32300e'),
    ('columns', 'audit_logs.details', '2fd85b3e79878aa321dff47b8d5f6265'),
    ('columns', 'audit_logs.created_at', '595204ccea13de65dcc5e308124e9545'),
    ('columns', 'audit_logs.user_id', '0dd0ff2426777c8482b1b044c06e785e'),
    ('columns', 'cash_register_sessions.id', 'bb10e6c61771cb16ab7cee5b98fa0706'),
    ('columns', 'cash_register_sessions.status', '56140fd802f62a720867c563b93b5ff4'),
    ('columns', 'cash_register_sessions.opening_amount', 'f2b12893c7646884f13e35540b130477'),
    ('columns', 'cash_register_sessions.closing_amount', '8feb1650a984ede512f34c2a567cd450'),
    ('columns', 'cash_register_sessions.withdrawal_total', 'fbd7a5f0b9dc7e6df7a38efa76a6b7a1'),
    ('columns', 'cash_register_sessions.notes', '5d52d30617b0e43c2abb6d85a8cff0ed'),
    ('columns', 'cash_register_sessions.opened_at', 'fe031fccb06c39606e9525ad73c24bbf'),
    ('columns', 'cash_register_sessions.closed_at', '5917057d7f70b3264d638f1250ec0ef6'),
    ('columns', 'cash_register_sessions.opened_by_id', '4ac6efa5a6b2863917c419652a85b8aa'),
    ('columns', 'cash_register_sessions.closed_by_id', '67280485f7d00c7bc74f8fd0347d7ee9'),
    ('columns', 'cash_withdrawals.id', '6a20e51ca98249f0610be165c01412b3'),
    ('columns', 'cash_withdrawals.amount', 'c6fdc0120889e1ace67f717c80610e37'),
    ('columns', 'cash_withdrawals.reason', '8902025b2595e29c6a30be3b1ff83b46'),
    ('columns', 'cash_withdrawals.created_at', 'cc1d791490b87083ab0c9e5102058da2'),
    ('columns', 'cash_withdrawals.session_id', '1a4574e15af04b88bae4ec2706410fc1'),
    ('columns', 'cash_withdrawals.created_by_id', 'a5928adb10a38d07dedcdf7177f5548d'),
    ('columns', 'categories.id', '343631ad21101ad975ba7b4602801e71'),
    ('columns', 'categories.name', '3df96cb8a3adb840cb22b50a75eb16f8'),
    ('columns', 'categories.is_meal_category', '9298d2a9c9024f8100a044f6547e3def'),
    ('columns', 'categories.price_per_kg', 'b64c88b8cea0b30eade383ad69a12d1b'),
    ('columns', 'categories.self_service_price_per_kg', 'f60db8a29cc4b5d62281f8e751cf0851'),
    ('columns', 'credit_settlements.id', '35c0620e320f1f25f1706a45b5180c07'),
    ('columns', 'credit_settlements.charge_id', 'de3a587fdeb3520367a366009bc8157c'),
    ('columns', 'credit_settlements.payment_id', '4e8f25e048078de8194a88eb7fcb28e3'),
    ('columns', 'credit_settlements.amount', '5b5d3bc4809b5660c42532204a3664ec'),
    ('columns', 'credit_settlements.created_at', '51b66f7910f92cf3b4ec963f2abc248a'),
    ('columns', 'credit_transactions.id', '4106d204aeec9c7637f5edb682131968'),
    ('columns', 'credit_transactions.type', '83f2b71d5bc94c9f99cab9eca2de3fac'),
    ('columns', 'credit_transactions.amount', 'bd23478fba2687041c317bff8d80854f'),
    ('columns', 'credit_transactions.description', 'f98c5dc7130ce192225807bacaab18cd'),
    ('columns', 'credit_transactions.created_at', '8318139ad91c2445e2193ad768059604'),
    ('columns', 'credit_transactions.customer_id', '51bfc566672edcd89155603a056cac23'),
    ('columns', 'credit_transactions.order_id', '0105d69d60ff2b84b3dc5b1667fb28fb'),
    ('columns', 'credit_transactions.status', '7bf65d5b25cd92b019413501bb557a5c'),
    ('columns', 'credit_transactions.settled_amount', 'ec4bdafecb03c1f6bd74b7dcd45457f0'),
    ('columns', 'credit_transactions.settled_at', '6a03e173b9b1436b6e4468f96fd9687d'),
    ('columns', 'customers.id', '2179f3ab361135e9fd1009446ed1dc93'),
    ('columns', 'customers.name', '1f10bf6f566d0127cfd8278f360354a6'),
    ('columns', 'customers.phone', 'fd531c920c81602efd9ec6cc1ddd912e'),
    ('columns', 'customers.email', 'e85fb22cda3c006a4d5615832b84eb45'),
    ('columns', 'customers.address', '0c136e858e423fcea469070142324320'),
    ('columns', 'customers.credit_limit', 'd4436ed6ff0260a0ef820430049e6592'),
    ('columns', 'customers.credit_used', '8c2d537d77e24d5ded04df5c6a31f6d0'),
    ('columns', 'customers.created_at', 'fdd8387aa22214f1853aac2ecd232e83'),
    ('columns', 'customers.updated_at', 'f5cb7ee061f405a5af4555b54a114aa5'),
    ('columns', 'customers.person_type', '3648c01f33da21e8f62f919523fd5213'),
    ('columns', 'customers.document', 'd28c77dc0afe1b7c2099b6c3d6bab73b'),
    ('columns', 'customers.legal_name', '670e9440610028045b8337380c68b6b4'),
    ('columns', 'customers.state_registration', '182e35114d0e45984e7177a539582d75'),
    ('columns', 'customers.fiscal_zip_code', '07ecf67c1cdde41b61a25c3fa160769b'),
    ('columns', 'customers.fiscal_street', '946830ebd188ccadce15ea02f6bdc0f2'),
    ('columns', 'customers.fiscal_number', 'ebbaa01f80b8b00ba3e1b7d72b16ccf0'),
    ('columns', 'customers.fiscal_neighborhood', '9cbe1e9614265d3dee83f394b3d09d57'),
    ('columns', 'customers.fiscal_city', '1a3cded6af0e72f8c670f715719634fc'),
    ('columns', 'customers.fiscal_city_ibge_code', '2b54b4f7fe87cad0ac46f83ba51435b9'),
    ('columns', 'customers.fiscal_state', '71d7f86866f42a1746cf8abe1b014b3a'),
    ('columns', 'invoices.id', '0f9eb7e7500c29d5d8737f53c20c340f'),
    ('columns', 'invoices.customer_id', 'e8e0e1841c4ef53166463064b95e38ab'),
    ('columns', 'invoices.order_id', '6ae4ab642ecb039125d815f6964b627e'),
    ('columns', 'invoices.credit_transaction_id', 'ffe3cfff7a566cb7c29c4782397ef7e2'),
    ('columns', 'invoices.focus_ref', '02795973ae10a8130c04b50ec701626a'),
    ('columns', 'invoices.environment', 'cb2b4ef0eb789b0113678daa8104a987'),
    ('columns', 'invoices.status', '585fa9a243bafed2095c2954bd530180'),
    ('columns', 'invoices.sefaz_status', 'a0ba34c3b2e358a993f4fa7f148f8e76'),
    ('columns', 'invoices.sefaz_message', 'd36c08460a295b8608d6655be98763e5'),
    ('columns', 'invoices.access_key', 'c9312342ae7a42e44cfe7cbc6ad0f223'),
    ('columns', 'invoices.number', 'c3bb16af282e2f1311d55248a1f16d30'),
    ('columns', 'invoices.series', '06fb63833c4e4c308d1e6d1cf2e46834'),
    ('columns', 'invoices.danfe_url', 'aec068261891c69292e740fe41edc205'),
    ('columns', 'invoices.xml_url', 'd7307585a94e34325e99bcb2a8b91bee'),
    ('columns', 'invoices.created_at', '077b9e8fd8d015a721aebb18cf60212a'),
    ('columns', 'invoices.updated_at', 'a92cfb52cc7fdf1737de4e650da23078'),
    ('columns', 'invoices.model', '0f0b16c0d01d9f0b4dc85a44bc9b6894'),
    ('columns', 'invoices.consumer_document', '390a117d5a0ee34a8eaac2303fb7787c'),
    ('columns', 'invoices.qrcode_url', '6628dffe25a1b125b07b9d9cb2c9aed9'),
    ('columns', 'marmita_menu_items.id', '61ca7a31fa3b8d9e52d9a4d4d5beca96'),
    ('columns', 'marmita_menu_items.day_of_week', 'f00da1f6061e71c07d17e5f75bc1fa01'),
    ('columns', 'marmita_menu_items.name', '5d8e1e591bae82115de2f7466249450a'),
    ('columns', 'marmita_menu_items.group', 'e717dd178b7736b4b6be183b605fa0bd'),
    ('columns', 'marmita_menu_items.price', 'c72c1a03e06df6c379d03d708a78e6fa'),
    ('columns', 'marmita_menu_items.is_active', '49daed5987d632272280a102bf4372b1'),
    ('columns', 'marmita_menu_items.sort_order', '6aa13e258bc79960f145ecb957c745fe'),
    ('columns', 'marmita_menu_items.created_at', '9aff53d238460be48c5e3a745d0aa5da'),
    ('columns', 'marmita_menu_items.updated_at', '0a73d8752a1151ae01bf6b8b74a09ad9'),
    ('columns', 'order_items.id', 'd60e91d87a0a885d903b491c7f8fba24'),
    ('columns', 'order_items.quantity', '54ce8f3fd1f9cd27f5f43361d6f9af87'),
    ('columns', 'order_items.weight', 'dd3c1ac2be9e723f846437f4efc6d70a'),
    ('columns', 'order_items.price', 'cef3d55e716029fcb43ed6729b83659e'),
    ('columns', 'order_items.unit_price', '17715c68c8320d615f3a0a1f848b0c9b'),
    ('columns', 'order_items.manual_price', '67903c14a893dd4a6b558ea310b3955c'),
    ('columns', 'order_items.sale_type', 'd4e38022e37709e4cd9fb1b7b51d5dc7'),
    ('columns', 'order_items.notes', '53c017745ef0334d3c4dbd45a18ca55d'),
    ('columns', 'order_items.order_id', 'c81cd7c9ea96ed94ffac1e7e0e76d76e'),
    ('columns', 'order_items.product_id', '23ec346fbe2fb97c0283944eb5f4ec79'),
    ('columns', 'order_items.product_name', '03938ea4e1510ab3b32d227f5429f6d5'),
    ('columns', 'orders.id', 'a642931cebd6ffc86e61391a1fbeb0bc'),
    ('columns', 'orders.type', 'd1fd80adcc583cc8e5391da3c11c1089'),
    ('columns', 'orders.status', '07efc6f0ff5c7dcd98536c8cdd49d8f1'),
    ('columns', 'orders.total', '08f6654494d9a91d46414e7d68084035'),
    ('columns', 'orders.created_at', '4dd5ad662276570734b3a405aa6cbf78'),
    ('columns', 'orders.updated_at', 'cf6c10c0872cbc5f02855d85828666b7'),
    ('columns', 'orders.customer_name', '7379add0bcdaa089b6e7d1a675c9cd27'),
    ('columns', 'orders.delivery_street', '334b4405b0d7b231aba09737c0fc51b8'),
    ('columns', 'orders.delivery_number', 'bb6a8cacaf84508722099ce03025b687'),
    ('columns', 'orders.delivery_neighborhood', '2bac3feb27e2ad1384e8755a2a54c3f9'),
    ('columns', 'orders.delivery_reference', '9e842903fc3431dc017d3d5df58e9063'),
    ('columns', 'orders.delivery_phone', 'c473b29a544123fcddb2728edd9d2e5b'),
    ('columns', 'orders.delivery_notes', '9ca4fb9f03333bc3c99ced1c7a1f7539'),
    ('columns', 'orders.delivery_fee', '8083b570d4ecad0a32d7207a4186460d'),
    ('columns', 'orders.delivery_type', '17a6f7cf76f0a3be0912d4445976adfe'),
    ('columns', 'orders.table_id', '93bb131b73a95d2c8389a6670e85d411'),
    ('columns', 'orders.user_id', '8df6b70333444d26bfe13be30184b019'),
    ('columns', 'orders.waiter_id', '1599f07b550a76b5b39763e176ff842f'),
    ('columns', 'orders.customer_id', 'f8a5422161f27bcdf81dd1432d174689'),
    ('columns', 'orders.cash_register_session_id', '91a2ce67203cb5162a6bd081f3237a3b'),
    ('columns', 'orders.idempotency_key', 'bee3e8567fa7c2cf7e74f38d20c861fd'),
    ('columns', 'orders.source', '2fb61efadc2f782d77ff3f807b6d6c83'),
    ('columns', 'orders.table_tab_id', '64133da46a772874128b05c8b07c1c71'),
    ('columns', 'payable_accounts.id', '1e30327ee8c602d4df35a31aa53c3d23'),
    ('columns', 'payable_accounts.description', '5c74a2ab87341c6a25cc10794a5b5c78'),
    ('columns', 'payable_accounts.amount', 'ca2869fcfd2a46f07bf39266500e0ffd'),
    ('columns', 'payable_accounts.due_date', '0d846c3cec6f1074e21e5cda824aebea'),
    ('columns', 'payable_accounts.paid', '9e6b3023b2b1fd97ee311f1a767a2449'),
    ('columns', 'payable_accounts.paid_at', '676c400c14a70585d936477352e696ec'),
    ('columns', 'payable_accounts.created_at', 'fc52db664f8c8009a4761340fda33780'),
    ('columns', 'payable_accounts.updated_at', '6a813c54e9f957f85e7f00ee9cb1d367'),
    ('columns', 'payable_accounts.supplier_id', '047ff664ae86e66d9214f93bccfd93cb'),
    ('columns', 'payments.id', 'c8fed0e6fae92cd55e0fc30a927fa378'),
    ('columns', 'payments.method', '02eff442da20d7026fd99a8e41aeb477'),
    ('columns', 'payments.amount', '754ebd216156786d58381c0d3ab58e08'),
    ('columns', 'payments.status', 'e46a9d05009a49f4f589c1480f0c77b8'),
    ('columns', 'payments.transaction_id', '60975db881ed10a8e5b9a4d70f1881ac'),
    ('columns', 'payments.created_at', 'f9cf7a770af546c5f212247146d3c846'),
    ('columns', 'payments.order_id', '4c238208f59934466d3aa329623bb257'),
    ('columns', 'product_stock_items.id', '4246c0fcf93e3620112a6114e4cd1e3b'),
    ('columns', 'product_stock_items.quantity', 'f2e29f4495341a44f8fceb7d3e70296b'),
    ('columns', 'product_stock_items.product_id', '4c1eb5ba225e9bf3aa30e2d2da487bca'),
    ('columns', 'product_stock_items.stock_item_id', '98d35d09653891f9b4fefdbcb3858ff6'),
    ('columns', 'products.id', 'b6ee2705996c887ccf70fd9c2c44f2cc'),
    ('columns', 'products.name', 'c56f29914d263b0acc88046b42f3d89f'),
    ('columns', 'products.description', '6d1b0fdd0ec5110954315297cc1bdf54'),
    ('columns', 'products.price', 'c9c86fd8909cbcb91e322f433ff86037'),
    ('columns', 'products.is_by_weight', 'c1d54f32aa3890146e6cfee65e5fdc63'),
    ('columns', 'products.image_url', '78600a7f2dbb1f1af26084daf503e8cd'),
    ('columns', 'products.created_at', 'c29c574542ed8e099bbcca3973fda028'),
    ('columns', 'products.updated_at', '59787e9428ba2431f058f4b15f739eae'),
    ('columns', 'products.category_id', 'ce15b8295cb11f3480b69c1d6bbdb53d'),
    ('columns', 'products.ncm', 'bf28b0452490794bba45c6bae5499b29'),
    ('columns', 'products.cfop', '634855e2fe607e11572dda4101f95812'),
    ('columns', 'products.origin', '1b8e8c8cccd4ce66047a9c525709b55f'),
    ('columns', 'products.tax_code', '3f432bdf8050d1d2e0a1a8a14ffdda97'),
    ('columns', 'products.is_paused', '3e81e199866a22b41ba6c0888f169cd5'),
    ('columns', 'products.paused_at', '75db4fa90faf2fe3d4b1dcf47dafd01e'),
    ('columns', 'restaurant_config.id', 'e9f60c6fd77cbed03544e3e743653598'),
    ('columns', 'restaurant_config.name', '3a7a3ef9229353afc3c11d5768aab33d'),
    ('columns', 'restaurant_config.logo_url', 'a49b877d3ee8a79cf741f428a53b5ddd'),
    ('columns', 'restaurant_config.banner_url', 'a8fe55f2041e377df9921a406c95a329'),
    ('columns', 'restaurant_config.address', '789d5398929dccff71d787c131209c82'),
    ('columns', 'restaurant_config.phone', 'cad92847b39b18d8b4ad7fc87f8623c8'),
    ('columns', 'restaurant_config.opening_hours', '7ff1e68f048fd8d66855ddacebd69673'),
    ('columns', 'restaurant_config.opening_days', '1bb627fcad8c793c4d6604d26beeac66'),
    ('columns', 'restaurant_config.delivery_fee', '8346d16d400d214df177f8ed1f19d006'),
    ('columns', 'restaurant_config.urban_delivery_fee', 'e956fb73eb003583214e7a2757124285'),
    ('columns', 'restaurant_config.rural_delivery_fee', '2207f9d9e5c1a92b42af47e0c993a3f0'),
    ('columns', 'restaurant_config.enabled_payments', '5ee4c6c70036265cd65a856ed24f3df8'),
    ('columns', 'restaurant_config.updated_at', '3a67a834af338b973e5f2f1537729070'),
    ('columns', 'restaurant_config.cnpj', 'ac86c3323f0a92b9b292b4bc4bd27b68'),
    ('columns', 'restaurant_config.legal_name', 'f658096a54f04178f1c4cfe6a38bf0a6'),
    ('columns', 'restaurant_config.state_registration', '824eee54b9ec14c1ccdc0a978081bb4c'),
    ('columns', 'restaurant_config.tax_regime', '7c30d0c2399bca9ebb4fa271f6537de2'),
    ('columns', 'restaurant_config.fiscal_city_ibge_code', '93bdc045acbbba5ebdc5a9542f59dff5'),
    ('columns', 'restaurant_config.fiscal_zip_code', '065ce2ac6a06a2e96b3b6b6fc5ebb109'),
    ('columns', 'restaurant_config.fiscal_street', '91ffea827c82a2721a899f54c42e7519'),
    ('columns', 'restaurant_config.fiscal_number', '8ad66e28fffe9face729ddfd231f7867'),
    ('columns', 'restaurant_config.fiscal_neighborhood', '17caf1f4973e1a1bb840fc4b02d2a090'),
    ('columns', 'restaurant_config.fiscal_city', 'b1c5c62c0970f71b93c03161867da035'),
    ('columns', 'restaurant_config.fiscal_state', '661a9df9c3e02625c17a35a465e4439b'),
    ('columns', 'restaurant_config.default_cfop', 'd018d8edccababd859d6376326160358'),
    ('columns', 'restaurant_config.default_ncm', 'c01f64120fb412ad6cb4240646b5caf3'),
    ('columns', 'restaurant_config.default_origin', '5069bf37c9cac93980a73b43c7039a4c'),
    ('columns', 'restaurant_config.default_tax_code', '55a809efa080fd80f511f270daea6eba'),
    ('columns', 'restaurant_config.nfce_enabled', 'fe84e99a6cc5eca2f37abf2095b785bb'),
    ('columns', 'restaurant_config.nfce_group_items', 'ba995ea979d194ddec153560a7f2b491'),
    ('columns', 'restaurant_config.nfce_grouped_item_description', '45f01caa8a72cd3254136c59241bc9dd'),
    ('columns', 'stock_items.id', '35b0cd9078baf08fb63b16a8423784d7'),
    ('columns', 'stock_items.name', '1852345e63d2241e20e2e5d365bad587'),
    ('columns', 'stock_items.quantity', '1511888c14b9283c007568cbbab04dfd'),
    ('columns', 'stock_items.unit', '104639fef844719e3209153b509a1368'),
    ('columns', 'stock_items.min_quantity', '3c3adb2e1a80e320c8bc0530cb1e0aab'),
    ('columns', 'stock_items.created_at', '445444f244c9d882d8a9a96baa478b81'),
    ('columns', 'stock_items.updated_at', 'f19e0c287fc0eecf0cb81c08c74f62b4'),
    ('columns', 'supplier_stock_items.id', '5ee86ff689df08f8ecaffd6c1f895907'),
    ('columns', 'supplier_stock_items.price', 'a7d5df5a825f907fd5d2e5c93d9c422f'),
    ('columns', 'supplier_stock_items.updated_at', 'c56106d5f13d23476f91896ffb0cf675'),
    ('columns', 'supplier_stock_items.supplier_id', '79435322d8b019b9add4a1aa0312fad5'),
    ('columns', 'supplier_stock_items.stock_item_id', '344d8e1ef2b85f50b89e34aa2e4b28e4'),
    ('columns', 'suppliers.id', '654eb110838a30e9d3a56da72788df69'),
    ('columns', 'suppliers.name', 'd34012d41822a5e28bf33687516e88fa'),
    ('columns', 'suppliers.contact', '32d64a1d8916e66cf081db8a92b136f4'),
    ('columns', 'suppliers.phone', 'ae04647d5b14af22e74eba99cf83a7da'),
    ('columns', 'suppliers.email', '76770b9a7739e9e044f71ef054bc135d'),
    ('columns', 'suppliers.created_at', '7327d69f59e39f15edd6da9eff64836c'),
    ('columns', 'suppliers.updated_at', '936a159770be8fe01146f557baf1eff3'),
    ('columns', 'table_tabs.id', '3e0b9afa448fe12edba5e43cfa50296c'),
    ('columns', 'table_tabs.table_id', 'ddcc05b02d1437ca24070a6822e1aa0b'),
    ('columns', 'table_tabs.cash_register_session_id', 'f818021e620f5365127d331d8bdf6fa2'),
    ('columns', 'table_tabs.name', '68d71dc3836363d04dcd71444bd7c4e7'),
    ('columns', 'table_tabs.status', 'ced8e6f454c01f08366d191b35a7b845'),
    ('columns', 'table_tabs.opened_by_id', '707260c82595c1bdcd64400f506c2302'),
    ('columns', 'table_tabs.closed_by_id', '52155e666e8d4670bad810264feaf7a2'),
    ('columns', 'table_tabs.opened_at', '59e5c2bf4bc7fe0e5976a19fe28eaf8e'),
    ('columns', 'table_tabs.closed_at', '8b4279e1ffe351fe2ee5853e294d6c83'),
    ('columns', 'table_tabs.updated_at', 'ecff1d28b5dee6c6097ab72d71d3d3f6'),
    ('columns', 'tables.id', 'a72f7fe8a2dba0a93b2591522bd96b71'),
    ('columns', 'tables.number', 'b5de421425c217ac3cf681bb1dd2d748'),
    ('columns', 'tables.status', '2aee1dddc99ea67bc5aa9e0c7f8ed9b5'),
    ('columns', 'users.id', '31f8218e5fb5c8929901d8b38c679342'),
    ('columns', 'users.name', '3b8cffe168b53285f498995dfb7c4e54'),
    ('columns', 'users.email', 'f9c774111a1648ca4a649d6001195fe8'),
    ('columns', 'users.password', '3966d30f55acc4d92a86e807fd15a651'),
    ('columns', 'users.role', '6752ee465297f901775e7d6552775993'),
    ('columns', 'users.created_at', '078043f4ec2f46eb870111840c79cbb5'),
    ('columns', 'users.updated_at', '6aae2c965f786d1c5cd12519aaf7992f'),
    ('constraints', 'audit_logs.audit_logs_user_id_fkey', '48b9d3961cfed28b72554af5f8095770'),
    ('constraints', 'audit_logs.audit_logs_pkey', '7fb62731624b6139a435bfe31b61294c'),
    ('constraints', 'cash_register_sessions.cash_sessions_closed_consistency_check', 'f3d6b9235a84e9ae19acf145dd85339a'),
    ('constraints', 'cash_register_sessions.cash_sessions_closing_amount_check', 'fef3f98a032bc73a2011a5d79ffb8605'),
    ('constraints', 'cash_register_sessions.cash_sessions_opening_amount_check', 'abd01747821c3702bb59a6d0f226210b'),
    ('constraints', 'cash_register_sessions.cash_sessions_status_check', 'a7413b50e39c10c2f1d21035d575e361'),
    ('constraints', 'cash_register_sessions.cash_sessions_withdrawal_total_check', '13290d3b600012613839b493a0e52010'),
    ('constraints', 'cash_register_sessions.cash_sessions_closed_by_fkey', '93d3d81740b88dc39cee7be32c85a2be'),
    ('constraints', 'cash_register_sessions.cash_sessions_opened_by_fkey', '2e622fe1cd5d72a51f4f6a8e640e0af0'),
    ('constraints', 'cash_register_sessions.cash_register_sessions_pkey', 'c8843c261d57b9b191b627feffb05334'),
    ('constraints', 'cash_withdrawals.cash_withdrawals_amount_check', 'e8267d1cbcf38201f47c95669bb9fc7e'),
    ('constraints', 'cash_withdrawals.cash_withdrawals_created_by_fkey', 'cf9a73bc4a2b78d8f8be32556c5a9175'),
    ('constraints', 'cash_withdrawals.cash_withdrawals_session_fkey', '1cf5296f9f7cfc515340c8c11109f6b2'),
    ('constraints', 'cash_withdrawals.cash_withdrawals_pkey', 'e8a3c19d36dfd322307cefea2f424a8a'),
    ('constraints', 'categories.categories_price_per_kg_check', 'de021682f800a4c5d9f670a6fae8c482'),
    ('constraints', 'categories.categories_self_service_price_check', 'e2152b2efcb802e74ca18360fa9c1a2d'),
    ('constraints', 'categories.categories_pkey', '7d436d02db3bdcf13ae25d94265beb51'),
    ('constraints', 'categories.categories_name_unique', 'f5759c1fde7a858a33a530dfc55aca12'),
    ('constraints', 'credit_settlements.credit_settlements_amount_check', '7c12a56a5c4d68e6edcd7b7d5255dd2f'),
    ('constraints', 'credit_settlements.credit_settlements_charge_id_fkey', '5ee41d36021b6319ad55017bee05c6ba'),
    ('constraints', 'credit_settlements.credit_settlements_payment_id_fkey', '250c0f4f01f18f7bfe4def58e7bb977a'),
    ('constraints', 'credit_settlements.credit_settlements_pkey', '0b5491d31f3cc2e3614372deb7b8991b'),
    ('constraints', 'credit_transactions.credit_transactions_settled_amount_check', '71d09367d6771f42065522cf933c0a83'),
    ('constraints', 'credit_transactions.credit_transactions_status_check', '5b048ca86a8cd93301c9db1bf5f33377'),
    ('constraints', 'credit_transactions.credit_tx_amount_check', '9a7ed99b99f46034a5f8963dd73dd760'),
    ('constraints', 'credit_transactions.credit_tx_type_check', 'c4f1352a14320d516861182fe088a448'),
    ('constraints', 'credit_transactions.credit_transactions_order_id_fkey', '43ea08616068739806a1616df8674c2f'),
    ('constraints', 'credit_transactions.credit_tx_customer_fkey', '991bfb8a84b05c4e6e567e65bbd8dbc5'),
    ('constraints', 'credit_transactions.credit_transactions_pkey', '698956d8ca94b3d0eee10c54540b32bb'),
    ('constraints', 'customers.customers_credit_limit_check', '70cee1e591f461492681f91c5b598663'),
    ('constraints', 'customers.customers_credit_used_check', '0fe1a4f379076c5381a44c7359f753c1'),
    ('constraints', 'customers.customers_person_type_check', '418a9d37f82f1526ed6886e17a95c123'),
    ('constraints', 'customers.customers_pkey', '314630c6b525518352f9096e31ddcb8f'),
    ('constraints', 'customers.customers_email_unique', '33ce817fadd93926ddf69270307098ca'),
    ('constraints', 'customers.customers_phone_unique', 'e233879f109d0aab2707dd20737767ee'),
    ('constraints', 'invoices.invoices_environment_check', '3cb036c87253fa12cae761af86dd0eee'),
    ('constraints', 'invoices.invoices_model_check', '7776ba908b4319977d0cf3d08bdb4dc3'),
    ('constraints', 'invoices.invoices_status_check', '0a15346e4cf2b294fd59c87662494fac'),
    ('constraints', 'invoices.invoices_credit_transaction_id_fkey', 'eadfde422385984e8ee68d6f19c369b6'),
    ('constraints', 'invoices.invoices_customer_id_fkey', '49315a519e1fe5d4a375bcb5a0dfa995'),
    ('constraints', 'invoices.invoices_order_id_fkey', '02a8b996cf371d05184c766e4df111ca'),
    ('constraints', 'invoices.invoices_pkey', 'ae1fd3a6944ccddab7f40f8d40547a1e'),
    ('constraints', 'invoices.invoices_focus_ref_key', '9dac1a501dd09196c603f4fc7d8e6938'),
    ('constraints', 'marmita_menu_items.marmita_day_of_week_check', 'fd7c08a0a92a8ef7cdbf0b989d7178db'),
    ('constraints', 'marmita_menu_items.marmita_price_check', '4a66fcbf2eda55e0ad917085c4909359'),
    ('constraints', 'marmita_menu_items.marmita_menu_items_pkey', 'dda5959d8272772e86ee54b2f2643635'),
    ('constraints', 'order_items.order_items_price_check', '54752bc74d70e2af29c32a29438ccfd6'),
    ('constraints', 'order_items.order_items_quantity_check', 'a45f095e04c0bc48540b956c7314c6e2'),
    ('constraints', 'order_items.order_items_sale_type_check', '944b1ceb8177b3cb684ec80d873de3d6'),
    ('constraints', 'order_items.order_items_weight_check', 'd29d59ed8f11d8fbd326e651f9d4a685'),
    ('constraints', 'order_items.order_items_order_fkey', '8512da4ad1e7d3465081c2bb38d05e6a'),
    ('constraints', 'order_items.order_items_product_fkey', '3807ace5f3fedcf8453ec54f8ca6d212'),
    ('constraints', 'order_items.order_items_pkey', '5ae5260e8fe2f0e1ff8d883d5c10a955'),
    ('constraints', 'orders.orders_delivery_fee_check', '0d9bb50b60b2fa7d2b0fd9b7b467a4da'),
    ('constraints', 'orders.orders_delivery_type_check', 'f54e35e16151271949642f38c73c9a41'),
    ('constraints', 'orders.orders_source_check', '9a3e35504439add43600847410f3721f'),
    ('constraints', 'orders.orders_status_check', 'd52b8952020741ce37ba2b745a283c36'),
    ('constraints', 'orders.orders_total_check', '18aba83243d2f15332f6e5db2dff1325'),
    ('constraints', 'orders.orders_type_check', 'b303604cf90bbfd589e9f766340b2070'),
    ('constraints', 'orders.orders_cash_session_fkey', '8db06513938ab61eb631fe7240cf33d2'),
    ('constraints', 'orders.orders_customer_fkey', 'e9b41ee9836a57d25ae3221f069446e6'),
    ('constraints', 'orders.orders_table_fkey', '77c1056041b485cc69bb7534432b3a94'),
    ('constraints', 'orders.orders_table_tab_table_fkey', 'a0c0e60cdf02b92fed0f43bfbb5ce911'),
    ('constraints', 'orders.orders_user_fkey', '5a1844f4c6168332d862dc2ebcbd2357'),
    ('constraints', 'orders.orders_waiter_fkey', '013a551dfcbae0450f8b3a226414f0ff'),
    ('constraints', 'orders.orders_pkey', 'e544cbf7cdba57812950d904b8d748b1'),
    ('constraints', 'payable_accounts.payable_accounts_amount_check', '170e741ee152ea1e3bdb85a1c702a5fc'),
    ('constraints', 'payable_accounts.payable_accounts_paid_consistency_check', '2745fba45d4c7f03b18040a7e705324c'),
    ('constraints', 'payable_accounts.payable_accounts_supplier_fkey', 'b2509b2cc5868f2e0fed443213153125'),
    ('constraints', 'payable_accounts.payable_accounts_pkey', '3671b61408bd0a90e438f2324dd8f0f5'),
    ('constraints', 'payments.payments_amount_check', '9bd2ed3a9440e65ed1ef22c7ecd64b6c'),
    ('constraints', 'payments.payments_method_check', '145064d0b4e228ec63591d839e3b64f7'),
    ('constraints', 'payments.payments_status_check', 'b2bce34919499717227fa32fb33960d3'),
    ('constraints', 'payments.payments_order_fkey', '1ce363ff051ef24073b921dc7debd64c'),
    ('constraints', 'payments.payments_pkey', '98f40df7d3ad8a38a55b1bce0532134c'),
    ('constraints', 'payments.payments_order_unique', '46637afa05d2e04f22cd60335c0481dc'),
    ('constraints', 'product_stock_items.product_stock_items_quantity_check', 'b9afabcc13c4b52e32ea9f6bc2c6eea0'),
    ('constraints', 'product_stock_items.product_stock_items_product_fkey', '3aad9123f7715c231ca5512626681ba0'),
    ('constraints', 'product_stock_items.product_stock_items_stock_fkey', 'b195a707a9cd82a2a81cbdb7aec66ebc'),
    ('constraints', 'product_stock_items.product_stock_items_pkey', '60e398078d68be6f2695cd69c6b856a5'),
    ('constraints', 'product_stock_items.product_stock_items_unique', '9b79a496002c22b0f37a7ae2489f575c'),
    ('constraints', 'products.products_pause_state_check', '5fd866164b3e059db6481d9d8046e014'),
    ('constraints', 'products.products_price_check', '4632e793c96645d3bcd0fa5ba0960f4b'),
    ('constraints', 'products.products_category_id_fkey', '06389144f547e94059c0513292a9d6c7'),
    ('constraints', 'products.products_pkey', '04910045e0e08434da0e37ebc59be027'),
    ('constraints', 'restaurant_config.restaurant_config_delivery_fee_check', '8093f9be6ceadeec355994d59ffc18ec'),
    ('constraints', 'restaurant_config.restaurant_config_nfce_grouped_item_description_length_check', 'a3551e0ac0ae3a1e4278326e658609a5'),
    ('constraints', 'restaurant_config.restaurant_config_rural_fee_check', '7c14dd78894d910c86be801f3ef6dcc5'),
    ('constraints', 'restaurant_config.restaurant_config_urban_fee_check', '180dfae463a24869a3fe2c97df08e4b1'),
    ('constraints', 'restaurant_config.restaurant_config_pkey', 'af3ccc340781a980c21c0540d510cb4a'),
    ('constraints', 'stock_items.stock_items_min_quantity_check', 'c45c59f156db7e7393668e9cf5284952'),
    ('constraints', 'stock_items.stock_items_quantity_check', 'da2788d58f04e0d71577e88bb3cd6096'),
    ('constraints', 'stock_items.stock_items_pkey', 'e39ba5c7db96602632f5c9d253761a84'),
    ('constraints', 'stock_items.stock_items_name_unique', '638f0cae0042ef71a0ed8224506904f4'),
    ('constraints', 'supplier_stock_items.supplier_stock_items_price_check', 'ba1ea511d713a600060829d2c5f9eeed'),
    ('constraints', 'supplier_stock_items.supplier_stock_items_stock_fkey', 'b5bc886ecf2904e7bcc920c66727fcde'),
    ('constraints', 'supplier_stock_items.supplier_stock_items_supplier_fkey', '975c28a3baeee31a1e70e8da0ef2a05d'),
    ('constraints', 'supplier_stock_items.supplier_stock_items_pkey', 'da1b31b32b24f7b0646d0cdf417dcf1d'),
    ('constraints', 'supplier_stock_items.supplier_stock_items_unique', 'df7bb97465c956cfb31e0b2f7f7f84d5'),
    ('constraints', 'suppliers.suppliers_pkey', 'ccf221acd1db85214d7c9f9b799e38b3'),
    ('constraints', 'suppliers.suppliers_email_unique', '2c1ee18d3171b90cc9a77fb128f092dc'),
    ('constraints', 'table_tabs.table_tabs_closed_fields_check', '99d9ec4a2357d9a18ed05ebad53a59a4'),
    ('constraints', 'table_tabs.table_tabs_name_check', 'dd563b01438bbf7a6cc0afd6b7bf242d'),
    ('constraints', 'table_tabs.table_tabs_status_check', '9d8f313fba08eb944fc718cfe198a731'),
    ('constraints', 'table_tabs.table_tabs_cash_register_session_id_fkey', '41d4edd4886bfa7207ae5b78c2a934d2'),
    ('constraints', 'table_tabs.table_tabs_closed_by_id_fkey', 'f7c510a7a421223cf1f4adeb8fb36521'),
    ('constraints', 'table_tabs.table_tabs_opened_by_id_fkey', '409266a4c818855c29d5b31cd9c19ba6'),
    ('constraints', 'table_tabs.table_tabs_table_id_fkey', '360c2d80a8cc35b8a1e32f02d54b5f15'),
    ('constraints', 'table_tabs.table_tabs_pkey', '842632bda7e21a33fc9ac4bb0751c1e6'),
    ('constraints', 'table_tabs.table_tabs_id_table_id_key', '538187e66c1ad8d48d9461bee6c0b1ae'),
    ('constraints', 'tables.tables_status_check', '91b431ce58d2c52f3f28233caaba7dba'),
    ('constraints', 'tables.tables_pkey', '1e14d8c3623f6fb3510ac0897215cf2f'),
    ('constraints', 'tables.tables_number_unique', '8c497b51b6472920f422bbe45a7010e7'),
    ('constraints', 'users.users_role_check', '08c3c3c2b74b9404e57b81e1b5bbc8f5'),
    ('constraints', 'users.users_pkey', '7bf7ef9cddf3304c9108210285712b06'),
    ('constraints', 'users.users_email_unique', '05abb3fbba8213a48636a913a1d2cbf7'),
    ('indexes', 'audit_logs.audit_logs_pkey', '0c9bffcc8c17fd7ba3731fb11eeea125'),
    ('indexes', 'audit_logs.idx_audit_logs_created_at', 'd9e4839111fd506376837679019f7d23'),
    ('indexes', 'audit_logs.idx_audit_logs_entity', '93423938c71345f09baa095fe03c8af1'),
    ('indexes', 'audit_logs.idx_audit_logs_user_id', 'f602e13a4cb6ceef84771afc1e63f657'),
    ('indexes', 'cash_register_sessions.cash_register_sessions_pkey', '7b1468bebe05a19c53b9e2424f55e661'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_closed_at', 'ced84e948bece4efe4c8487197f98fa5'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_closed_by_id', '10f8e44ce7a15ba698ae35cfb596da21'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_only_one_open', 'ba1859947f45083af737ce24df5010dc'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_opened_at', 'f5f6e41139cbda0653d5e2853c782b38'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_opened_by_id', '75bdd1ccc489285b6bd5a89485bdb1e5'),
    ('indexes', 'cash_register_sessions.idx_cash_sessions_status', 'b0f300288536f63c4637415a5d310c8c'),
    ('indexes', 'cash_withdrawals.cash_withdrawals_pkey', '4f0e3366482ee61727b1523309108130'),
    ('indexes', 'cash_withdrawals.idx_cash_withdrawals_created_at', 'a1b66805aeefe6e8702a13a0366fab24'),
    ('indexes', 'cash_withdrawals.idx_cash_withdrawals_created_by_id', 'da80ed02ad5160a9004cbdb5e0351ccb'),
    ('indexes', 'cash_withdrawals.idx_cash_withdrawals_session_id', '1da469658ebd3754f336fa815a4e14ef'),
    ('indexes', 'categories.categories_name_unique', 'f4ce8d505be74f0b16084396a219e233'),
    ('indexes', 'categories.categories_pkey', 'e3563f906b2aae29470999307dd98052'),
    ('indexes', 'credit_settlements.credit_settlements_charge_id_idx', '750d5e939475cc563502f772721ef4b9'),
    ('indexes', 'credit_settlements.credit_settlements_payment_id_idx', '278b792d90ac3641ef595cbe1c2d90f7'),
    ('indexes', 'credit_settlements.credit_settlements_pkey', '2cc80aada472e924a933b79d7d4f7d3d'),
    ('indexes', 'credit_transactions.credit_transactions_customer_status_created_idx', '4580f859e9fe720cfd0d1ce32c7c5806'),
    ('indexes', 'credit_transactions.credit_transactions_order_id_idx', 'aa7c1fe35a028aa9b2118896c77938ae'),
    ('indexes', 'credit_transactions.credit_transactions_pkey', '5e3f4f9c21da0271fa0bfc7bf9f6c2b7'),
    ('indexes', 'credit_transactions.idx_credit_tx_created_at', '384083f4c6551e07d6573ca51b437c5d'),
    ('indexes', 'credit_transactions.idx_credit_tx_customer_id', '0e40c17465157ca3d5498442b574b39d'),
    ('indexes', 'customers.customers_email_unique', '3e4767cbfbb0b130c6e45b5b5d883fdf'),
    ('indexes', 'customers.customers_phone_unique', '6d65733aba55aa90db4cf2b06e39b820'),
    ('indexes', 'customers.customers_pkey', '34fd6bb809c832da7d5157eed450808c'),
    ('indexes', 'customers.idx_customers_name', '1d7b556854a27b52088f9aa7c645b0bb'),
    ('indexes', 'customers.idx_customers_name_trgm', '4464aa55af4c4c4858d2e24d3e807610'),
    ('indexes', 'invoices.invoices_active_order_idx', '8f0a32b5a3c7e688da5b0e0bff484432'),
    ('indexes', 'invoices.invoices_credit_transaction_id_idx', '386b946399976a75f43ab37d83c15210'),
    ('indexes', 'invoices.invoices_customer_id_idx', '796f9c9997e15d2217eb1fd21990762e'),
    ('indexes', 'invoices.invoices_focus_ref_key', 'c864c2948d1c9d2fca6882ee15b00aa3'),
    ('indexes', 'invoices.invoices_order_model_created_idx', '6f1e9e3205978659be4266009c409273'),
    ('indexes', 'invoices.invoices_pkey', '15c7b0568c73deede62e446a2ff35c08'),
    ('indexes', 'marmita_menu_items.idx_marmita_day_active_sort', '41aebb48c2601fb26e72df48cbb38f5a'),
    ('indexes', 'marmita_menu_items.idx_marmita_day_of_week', '2adf49deed6a381c062e48eb6fa4bfc1'),
    ('indexes', 'marmita_menu_items.idx_marmita_is_active', '5d6f498dd6ed89913bc60cb6388b0d99'),
    ('indexes', 'marmita_menu_items.marmita_menu_items_pkey', '57f0c494fe26eee1ba98ac8f65b4f990'),
    ('indexes', 'order_items.idx_order_items_order_id', '5a5821cb4d441ebd95cf229cd9094ba0'),
    ('indexes', 'order_items.idx_order_items_product_id', '065af35446d2c7432f64758c6a8ad5c2'),
    ('indexes', 'order_items.order_items_pkey', 'c86a90213df5e6f74bb65198a0508723'),
    ('indexes', 'orders.idx_orders_cash_session_id', '36fff3dfa5e132af0df79d8bf042dec7'),
    ('indexes', 'orders.idx_orders_created_at', '6451eece0b37c63e9583db293f62872b'),
    ('indexes', 'orders.idx_orders_customer_id', '9eab913056a956e111d235f88b95419a'),
    ('indexes', 'orders.idx_orders_customer_name_trgm', '4f212c8f6413a21de8ec425e2a45dfbd'),
    ('indexes', 'orders.idx_orders_session_status', '519ae7505dcb485c2a154e28d02684e5'),
    ('indexes', 'orders.idx_orders_status', '642241594d3dda3fbc65501b907c19cc'),
    ('indexes', 'orders.idx_orders_table_id', '452d753584ce66a383a949de83e6e377'),
    ('indexes', 'orders.idx_orders_type', 'ec30fdee71e78b0177eca0c7c6113332'),
    ('indexes', 'orders.idx_orders_user_id', '9df8dccf7a2bce68fdf294a625546545'),
    ('indexes', 'orders.idx_orders_waiter_id', '5e156eb006c7b249185b1dd3eae12612'),
    ('indexes', 'orders.orders_idempotency_key_idx', '7db509a0edbada63611e90b761fc4b5f'),
    ('indexes', 'orders.orders_pkey', 'a032c55c03e838baef2cbc2ba188bb0c'),
    ('indexes', 'orders.orders_table_tab_id_idx', '52049b75ca00ad22e51464412b4962e3'),
    ('indexes', 'payable_accounts.idx_payable_accounts_due_date', 'e890b3864dee91c9ff1ef3e4bf93a62d'),
    ('indexes', 'payable_accounts.idx_payable_accounts_paid', '02a22e7176d2330f3cf112b0df8e4571'),
    ('indexes', 'payable_accounts.idx_payable_accounts_paid_at', '37db2bc20ae021504ed45c0f6b2aad96'),
    ('indexes', 'payable_accounts.idx_payable_accounts_supplier_id', '798d87897f0ac13c4abc7203fa6ef925'),
    ('indexes', 'payable_accounts.payable_accounts_pkey', '1f82aa60b79568152c2b42761d4a47fc'),
    ('indexes', 'payments.idx_payments_created_at', '6da87dde69466ebcfb83c0eeb7d3ee3e'),
    ('indexes', 'payments.idx_payments_method', 'b6c3a5b87ce7481cb98ec1876da49479'),
    ('indexes', 'payments.idx_payments_status', '2db64fc162f5fd46099cf9fdd4cb80ee'),
    ('indexes', 'payments.payments_order_unique', '520dab8487bed20e7720cda6f59cc2ef'),
    ('indexes', 'payments.payments_pkey', '4c6ef8b1edbf9ab81c523a7d1425c2a0'),
    ('indexes', 'product_stock_items.idx_product_stock_items_product_id', '0a6dfe063032a42b8b5137cc1dd50b71'),
    ('indexes', 'product_stock_items.idx_product_stock_items_stock_item_id', '8236d055bad429b8878d7e9b75135854'),
    ('indexes', 'product_stock_items.product_stock_items_pkey', '27905def83687aa2fbf0c96bf0a9a961'),
    ('indexes', 'product_stock_items.product_stock_items_unique', '9d859cc650b6df0bb0c80cf64abde05f'),
    ('indexes', 'products.idx_products_category_id', '4b19457032d8b07323e175e9bf628204'),
    ('indexes', 'products.idx_products_name', '52a8b5878e00bb1f081be0fd3cf44f1c'),
    ('indexes', 'products.products_pkey', '80b0fb96678384c8ed21fbef631404df'),
    ('indexes', 'restaurant_config.idx_restaurant_config_singleton', '22489e412be5f6987e8c3c4e773d0fb8'),
    ('indexes', 'restaurant_config.restaurant_config_pkey', '48c0c94d0c28242cc6661526afb50378'),
    ('indexes', 'stock_items.idx_stock_items_low', 'f9f653c5332c4d575dfb1b6e5e0a5ebd'),
    ('indexes', 'stock_items.idx_stock_items_name', '722823d8b4f4cf343f345807f4314fe5'),
    ('indexes', 'stock_items.stock_items_name_unique', '220ce7545a400167a4e31691731aa243'),
    ('indexes', 'stock_items.stock_items_pkey', '0be1d34ab6bd781326fd31aa6d3e0169'),
    ('indexes', 'supplier_stock_items.idx_supplier_stock_items_stock_item_id', 'a06a455422d337cdce22d5a8170337b6'),
    ('indexes', 'supplier_stock_items.idx_supplier_stock_items_supplier_id', '4d36a350b34b09c9a8bd60a693c458b7'),
    ('indexes', 'supplier_stock_items.supplier_stock_items_pkey', '5842469deb2fd8522703dc581ede84b2'),
    ('indexes', 'supplier_stock_items.supplier_stock_items_unique', 'e0663396ff341850a0409dde70d59be4'),
    ('indexes', 'suppliers.idx_suppliers_name', '43be95d2c3396db6a8ab7038f60655ed'),
    ('indexes', 'suppliers.suppliers_email_unique', '8cf528924159002fb71eaebc960707d4'),
    ('indexes', 'suppliers.suppliers_pkey', '51011045a101ac14d299f4a2275dffc3'),
    ('indexes', 'table_tabs.table_tabs_cash_session_status_idx', 'fc2ab3aa3f7195b0d275ecce484f5ec6'),
    ('indexes', 'table_tabs.table_tabs_id_table_id_key', '1bdfb530af7db8961d8c2dab42437f54'),
    ('indexes', 'table_tabs.table_tabs_open_name_idx', 'b33632de70c080bc4b5849650569d319'),
    ('indexes', 'table_tabs.table_tabs_open_overview_idx', 'b70ef4a3395dc232046a5291c8af8ae8'),
    ('indexes', 'table_tabs.table_tabs_pkey', '1883015d0f078b15e0c098508ed88055'),
    ('indexes', 'table_tabs.table_tabs_table_status_idx', '9dd3bbd4e28952ed8b586be1ea922bc3'),
    ('indexes', 'tables.tables_number_unique', 'e3c2a52628a5981fd56eb6d0850b3fe1'),
    ('indexes', 'tables.tables_pkey', '6d47d317042781c96182add198d496dd'),
    ('indexes', 'users.idx_users_role', 'bf47919d812b33c9733bb4d964abcf18'),
    ('indexes', 'users.users_email_unique', '65603f2e09e217171c8436f97a6c3b61'),
    ('indexes', 'users.users_pkey', 'e201ae84bb367d4fd4974b284cd84efa'),
    ('functions', 'add_credit_charge', '78bafce9d1ed8f5463e53ffae04c30fd'),
    ('functions', 'block_cash_close_with_pending_orders', '08aaf806bfef5c6afbd2b307db3958b9'),
    ('functions', 'cancel_pending_payments_with_order', '9f1028219c09ac80606ae0a22ef5b496'),
    ('functions', 'close_empty_implicit_table_tab_after_order_delete', '8c1fe2238ce832279186ddcbf84b935c'),
    ('functions', 'close_settled_table_tab_after_order', '8714021515fc9f1fc34227a3d4e0adcb'),
    ('functions', 'close_table_tab', '1ee28830f8dcdd5d81ba8e2dab4288b4'),
    ('functions', 'consume_order_stock', 'f53fe51282a9fb5b510a6f2994accd29'),
    ('functions', 'create_order_with_stock', 'b41e5e2e7bdab08d38bb139a3783c686'),
    ('functions', 'finance_report', 'a5c1b65b326b883ce5aa0598b132dbe5'),
    ('functions', 'open_table_tab', 'e7c28de76eba8564c2397c5fc066c9f5'),
    ('functions', 'pay_customer_credit', 'a9792122de798b5a1bc6b73457ea563d'),
    ('functions', 'pay_order_with_credit', 'f55cfddcea81aaa917053c03cc015f8e'),
    ('functions', 'prevent_table_release_with_open_tabs', '8f1efdfb598dc60e40e6df7c6cb6b2d3'),
    ('functions', 'release_table_after_last_tab', '8fa7208accc15403a71789c9aefea60f'),
    ('functions', 'replace_product_stock_links', '4d6a8fa8b7739848bc418f15931bb2a3'),
    ('functions', 'require_open_tab_for_occupied_table', '950d54c38d9b3d1fdf5c46b0e15548e8'),
    ('functions', 'restore_order_stock', '713046fd5cefb6f585efa139f459a190'),
    ('functions', 'set_updated_at', 'b1ecc04d4d3c420c8e7f29f379ba3f08'),
    ('functions', 'validate_order_table_tab', '19c2099f5f6536cd1e8b8e9d918205d9'),
    ('functions', 'validate_table_tab_close', '6abea5e2214fb679c4628a9939d405e4'),
    ('functions', 'validate_table_tab_parent', 'a18522e92320b62913cb323da3cf69b9'),
    ('triggers', 'cash_register_sessions.trg_block_cash_close_with_pending_orders', '5cc1095afcce757e7f6704737ea2249a'),
    ('triggers', 'customers.trg_customers_updated_at', 'c7ddad39d941ee031087a1b4a03b81c1'),
    ('triggers', 'invoices.invoices_set_updated_at', '3520c43bc0455832689867a094a0ad75'),
    ('triggers', 'marmita_menu_items.trg_marmita_updated_at', '0bd5bfedb9560aa3adc41f46d90999ea'),
    ('triggers', 'orders.trg_cancel_pending_payments_with_order', '4d32c276b385adac7566213c47bfa2c9'),
    ('triggers', 'orders.trg_close_empty_implicit_table_tab_after_order_delete', 'd07c31980e886a5af1e15faf60286d13'),
    ('triggers', 'orders.trg_close_settled_table_tab_after_order', '9fba4e09c119e41da884865a09f8ea62'),
    ('triggers', 'orders.trg_orders_updated_at', '37b8936a71ec306ae70b3ad32f2c1f99'),
    ('triggers', 'orders.trg_validate_order_table_tab', '534ddfbdf7d186864cb08c306efad165'),
    ('triggers', 'payable_accounts.trg_payable_accounts_updated_at', '1b05451a57b25f0de0f8913dd662db43'),
    ('triggers', 'products.trg_products_updated_at', 'f0aac79d98af44023ffa7b389860de4b'),
    ('triggers', 'restaurant_config.trg_restaurant_config_updated_at', 'c0da21a6d1993eba96cf53c5e1d9947e'),
    ('triggers', 'stock_items.trg_stock_items_updated_at', '5bb276ae9b37408d88a8c711a4b272ce'),
    ('triggers', 'supplier_stock_items.trg_supplier_stock_items_updated_at', '1740beb5e59eef34e1843ba6a7a08380'),
    ('triggers', 'suppliers.trg_suppliers_updated_at', 'cf1c10543d2b8294ec90eeb153fdf56e'),
    ('triggers', 'table_tabs.trg_keep_occupied_table_with_open_tab', 'cbd45806e64ee9effc0825e480814203'),
    ('triggers', 'table_tabs.trg_release_table_after_last_tab', '9916c2255e8b0104543d594be1e671ed'),
    ('triggers', 'table_tabs.trg_validate_table_tab_close', '415a82ddbe3b632138f9e3f776115345'),
    ('triggers', 'table_tabs.trg_validate_table_tab_parent', '1791714fecf086811c7e981a783ae8d2'),
    ('triggers', 'tables.trg_prevent_table_release_with_open_tabs', '92184cf4fcdaffc6450a264901739b3f'),
    ('triggers', 'tables.trg_require_open_tab_for_occupied_table', '3af090a45ccaf343c524c579253a904d'),
    ('triggers', 'users.trg_users_updated_at', '934697c8c0f9c1c720dbc51d39bd24f8'),
    ('rls', 'audit_logs', '8767cb6382c32aa4ee86eacd604290c5'),
    ('rls', 'cash_register_sessions', 'a2fc4b01aee0776f2bdb25ccf67d02f3'),
    ('rls', 'cash_withdrawals', '3104f7cc37e308d1283212e6a7e83cc5'),
    ('rls', 'categories', '92a6e67bd392689d663fb02d1a342829'),
    ('rls', 'credit_settlements', 'd28b140c9a2b8ea819db7730bb2e7d31'),
    ('rls', 'credit_transactions', 'ffd64eed3e93e42b7276acd7f8fe11b0'),
    ('rls', 'customers', '03ff681f3cbd481c171eb696aa350dca'),
    ('rls', 'invoices', '23408e975c43ab1642644ebc68c0ec61'),
    ('rls', 'marmita_menu_items', '3fbb2c5806b894f1f8b704cf966a1d49'),
    ('rls', 'order_items', 'df4292fc4b92c5d4e5b4a317bf748123'),
    ('rls', 'orders', 'adf7e4feff994c8c12f444a42fd933bc'),
    ('rls', 'payable_accounts', '96cdecb023927812d96c844920a955ab'),
    ('rls', 'payments', '0845203559e75ebf46e5c427467e85ba'),
    ('rls', 'product_stock_items', '49d3190d819d3fe3cccad30eb0a71785'),
    ('rls', 'products', '92d8203bc2a626c25c23ccfa02a7e47d'),
    ('rls', 'restaurant_config', '28512fc69b15080f852ee4e118ae162f'),
    ('rls', 'stock_items', '9c255853f411911ca91192c00ea1d813'),
    ('rls', 'supplier_stock_items', 'b878acced8d7d100f02a82e79fd32b79'),
    ('rls', 'suppliers', 'd9933003a21bb999293150ce7a1ae016'),
    ('rls', 'table_tabs', '13c832f4e4e524a39ff0e25e2d0e9f55'),
    ('rls', 'tables', '785d7432be71e08185cd05b35eeff6e3'),
    ('rls', 'users', '27de47795ed275afabfe016b3b9a2247')
),
expected_categories(category, expected_count, sort_order) as (
  values
    ('tables', 22, 1),
    ('columns', 230, 2),
    ('constraints', 116, 3),
    ('indexes', 97, 4),
    ('functions', 21, 5),
    ('triggers', 22, 6),
    ('rls', 22, 7),
    ('policies', 0, 8)
),
actual_objects(category, object_key, definition_hash) as (
  select
    'tables',
    table_row.relname::text,
    md5(table_row.relname)
  from pg_class as table_row
  join pg_namespace as namespace on namespace.oid = table_row.relnamespace
  where namespace.nspname = 'public'
    and table_row.relkind in ('r', 'p')

  union all

  select
    'columns',
    table_row.relname::text || '.' || attribute.attname::text,
    md5(concat_ws(
      '|',
      table_row.relname,
      attribute.attnum::text,
      attribute.attname,
      format_type(attribute.atttypid, attribute.atttypmod),
      (not attribute.attnotnull)::text,
      coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), 'null'),
      coalesce(case attribute.attidentity when 'a' then 'GENERATED ALWAYS' when 'd' then 'GENERATED BY DEFAULT' end, 'null'),
      coalesce(case attribute.attgenerated when 's' then 'STORED' when 'v' then 'VIRTUAL' end, 'null')
    ))
  from pg_class as table_row
  join pg_namespace as namespace on namespace.oid = table_row.relnamespace
  join pg_attribute as attribute on attribute.attrelid = table_row.oid
  left join pg_attrdef as default_row
    on default_row.adrelid = table_row.oid and default_row.adnum = attribute.attnum
  where namespace.nspname = 'public'
    and table_row.relkind in ('r', 'p')
    and attribute.attnum > 0
    and not attribute.attisdropped

  union all

  select
    'constraints',
    table_row.relname::text || '.' || constraint_row.conname::text,
    md5(concat_ws(
      '|',
      table_row.relname,
      constraint_row.conname,
      case constraint_row.contype
        when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE' when 'f' then 'FOREIGN KEY'
        when 'c' then 'CHECK' when 'x' then 'EXCLUDE'
      end,
      constraint_row.convalidated::text,
      constraint_row.condeferrable::text,
      constraint_row.condeferred::text,
      pg_get_constraintdef(constraint_row.oid, true)
    ))
  from pg_constraint as constraint_row
  join pg_class as table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace as namespace on namespace.oid = table_row.relnamespace
  where namespace.nspname = 'public'
    and constraint_row.contype in ('p', 'u', 'f', 'c', 'x')

  union all

  select
    'indexes',
    table_row.relname::text || '.' || index_row.relname::text,
    md5(concat_ws(
      '|',
      table_row.relname,
      index_row.relname,
      case constraint_row.contype
        when 'p' then 'PRIMARY_KEY_CONSTRAINT'
        when 'u' then 'UNIQUE_CONSTRAINT'
        when 'x' then 'EXCLUDE_CONSTRAINT'
        else 'STANDALONE_INDEX'
      end,
      index_meta.indisunique::text,
      index_meta.indisvalid::text,
      pg_get_indexdef(index_row.oid)
    ))
  from pg_class as index_row
  join pg_namespace as namespace on namespace.oid = index_row.relnamespace
  join pg_index as index_meta on index_meta.indexrelid = index_row.oid
  join pg_class as table_row on table_row.oid = index_meta.indrelid
  left join pg_constraint as constraint_row
    on constraint_row.conindid = index_row.oid and constraint_row.contype in ('p', 'u', 'x')
  where namespace.nspname = 'public'

  union all

  select
    'functions',
    procedure_row.proname::text,
    md5(
      btrim(
        regexp_replace(
          pg_get_functiondef(procedure_row.oid),
          E'\r\n?',
          E'\n',
          'g'
        ),
        E' \t\n\r'
      )
      || '|owner=' || owner_role.rolname::text
      || '|anon=' || has_function_privilege('anon', procedure_row.oid, 'EXECUTE')::text
      || '|authenticated=' || has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')::text
      || '|service_role=' || has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')::text
    )
  from pg_proc as procedure_row
  join pg_namespace as namespace on namespace.oid = procedure_row.pronamespace
  join pg_roles as owner_role on owner_role.oid = procedure_row.proowner
  where namespace.nspname = 'public'
    and procedure_row.prokind = 'f'
    and not exists (
      select 1
      from pg_depend as dependency
      join pg_extension as extension on extension.oid = dependency.refobjid
      where dependency.classid = 'pg_proc'::regclass
        and dependency.objid = procedure_row.oid
        and dependency.deptype = 'e'
    )

  union all

  select
    'triggers',
    table_row.relname::text || '.' || trigger_row.tgname::text,
    md5(btrim(pg_get_triggerdef(trigger_row.oid, true)) || '|' || trigger_row.tgenabled::text)
  from pg_trigger as trigger_row
  join pg_class as table_row on table_row.oid = trigger_row.tgrelid
  join pg_namespace as namespace on namespace.oid = table_row.relnamespace
  where namespace.nspname = 'public'
    and not trigger_row.tgisinternal

  union all

  select
    'rls',
    table_row.relname::text,
    md5(concat_ws('|', table_row.relname, table_row.relrowsecurity::text, table_row.relforcerowsecurity::text))
  from pg_class as table_row
  join pg_namespace as namespace on namespace.oid = table_row.relnamespace
  where namespace.nspname = 'public'
    and table_row.relkind in ('r', 'p')

  union all

  select
    'policies',
    policy.tablename::text || '.' || policy.policyname::text,
    md5(concat_ws(
      '|', policy.tablename, policy.policyname, policy.permissive,
      array_to_string(policy.roles, ','), policy.cmd,
      coalesce(policy.qual, 'null'), coalesce(policy.with_check, 'null')
    ))
  from pg_policies as policy
  where policy.schemaname = 'public'
),
expected_summary as (
  select
    category,
    count(*)::integer as object_count,
    md5(coalesce(string_agg(object_key || ':' || definition_hash, E'\n' order by object_key), '')) as category_hash
  from expected_objects
  group by category
),
actual_summary as (
  select
    category,
    count(*)::integer as object_count,
    md5(coalesce(string_agg(object_key || ':' || definition_hash, E'\n' order by object_key), '')) as category_hash
  from actual_objects
  group by category
),
differences as (
  select
    category.category,
    array(
      select expected.object_key
      from expected_objects as expected
      left join actual_objects as actual
        on actual.category = expected.category and actual.object_key = expected.object_key
      where expected.category = category.category
        and (actual.object_key is null or actual.definition_hash is distinct from expected.definition_hash)
      order by expected.object_key
    ) as missing_or_different,
    array(
      select actual.object_key
      from actual_objects as actual
      left join expected_objects as expected
        on expected.category = actual.category and expected.object_key = actual.object_key
      where actual.category = category.category
        and expected.object_key is null
      order by actual.object_key
    ) as unexpected
  from expected_categories as category
),
extension_status as (
  select
    extension.extname,
    extension.extversion,
    namespace.nspname as extension_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname in ('pg_trgm', 'pgcrypto')
),
results as (
  select
    category.sort_order,
    category.category,
    category.expected_count,
    coalesce(actual.object_count, 0) as found_count,
    (
      category.expected_count = coalesce(actual.object_count, 0)
      and coalesce(expected.category_hash, md5('')) = coalesce(actual.category_hash, md5(''))
    ) as matches,
    coalesce(expected.category_hash, md5('')) as expected_hash,
    coalesce(actual.category_hash, md5('')) as found_hash,
    coalesce(differences.missing_or_different, array[]::text[]) as missing_or_different,
    coalesce(differences.unexpected, array[]::text[]) as unexpected,
    null::text as extension_schema,
    null::text as extension_version
  from expected_categories as category
  left join expected_summary as expected on expected.category = category.category
  left join actual_summary as actual on actual.category = category.category
  left join differences on differences.category = category.category

  union all

  select
    9,
    'extension:pg_trgm',
    1,
    count(*)::integer,
    count(*) = 1 and min(extension_schema) = 'public',
    null,
    null,
    array[]::text[],
    array[]::text[],
    min(extension_schema),
    min(extversion)
  from extension_status
  where extname = 'pg_trgm'

  union all

  select
    10,
    'extension:pgcrypto',
    1,
    count(*)::integer,
    count(*) = 1 and min(extension_schema) = 'extensions',
    null,
    null,
    array[]::text[],
    array[]::text[],
    min(extension_schema),
    min(extversion)
  from extension_status
  where extname = 'pgcrypto'
)
select
  category,
  expected_count as expected,
  found_count as found,
  matches,
  expected_hash,
  found_hash,
  missing_or_different,
  unexpected,
  extension_schema,
  extension_version
from results
order by sort_order;
