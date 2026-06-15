
CREATE TABLE public.courier_import_mappings (
  target_field text PRIMARY KEY,
  label text NOT NULL,
  source_header text,
  occurrence int NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  data_type text NOT NULL DEFAULT 'string',
  sort_order int NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_import_mappings TO authenticated;
GRANT ALL ON public.courier_import_mappings TO service_role;

ALTER TABLE public.courier_import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read mappings" ON public.courier_import_mappings
FOR SELECT TO authenticated USING (public.is_active_admin(auth.uid()));

CREATE POLICY "Admins write mappings" ON public.courier_import_mappings
FOR ALL TO authenticated USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TRIGGER update_courier_import_mappings_updated_at
BEFORE UPDATE ON public.courier_import_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.courier_import_mappings (target_field, label, source_header, occurrence, is_required, data_type, sort_order) VALUES
  ('tracking_number',      'Tracking Number',         'თრექინგი',                       1, true,  'string', 10),
  ('courier_status',       'Courier Status',          'სტატუსი',                        1, true,  'string', 20),
  ('order_date',           'Order Date',              'შეკვ. თარიღი',                   1, false, 'date',   30),
  ('pickup_date',          'Pickup Date',             'აღების თარიღი',                  1, false, 'date',   40),
  ('status_date',          'Status Date',             'დას. თარიღი',                    1, false, 'date',   50),
  ('branch',               'Branch',                  'ფილიალი',                        1, false, 'string', 60),
  ('sender_name',          'Sender Name',             'გამგზ. სახელი, გვარი',           1, false, 'string', 70),
  ('customer_name',        'Customer Name',           'მიმღ. სახელი, გვარი',            1, false, 'string', 80),
  ('city',                 'City',                    'მიმღ. ქალაქი',                   1, false, 'string', 90),
  ('address',              'Address',                 'მიმღ. მისამართი',                1, false, 'string', 100),
  ('orderer_name',         'Orderer Name',            'შემკვ. სახელი',                  1, false, 'string', 110),
  ('sender_company',       'Sender Company',          'გამგზ. კომპანია',                1, false, 'string', 120),
  ('sender_city',          'Sender City',             'გამგზ. ქალაქი',                  1, false, 'string', 130),
  ('sender_address',       'Sender Address',          'გამგზ. მისამართი',               1, false, 'string', 140),
  ('sender_phone',         'Sender Phone',            'გამგზ. ტელეფონი',                1, false, 'string', 150),
  ('receiver_company',     'Receiver Company',        'მიმღ. კომპანია',                 1, false, 'string', 160),
  ('phone',                'Customer Phone',          'მიმღ. ტელეფონი',                 1, false, 'string', 170),
  ('service_level',        'Service Level',           'მომსახურების დონე',              1, false, 'string', 180),
  ('comment',              'Comment / SKU note',      'კომენტარი',                      1, false, 'string', 190),
  ('order_number',         'Order Number',            'შეკვეთის ნომერი',                1, false, 'string', 200),
  ('fragile',              'Fragile',                 'მტვრევადი',                      1, false, 'string', 210),
  ('weight_category',      'Weight Category',         'წონითი კატ.',                    1, false, 'string', 220),
  ('weight',               'Weight (kg)',             'წონა',                           1, false, 'number', 230),
  ('quantity',             'Quantity',                'რაოდენობა',                      1, false, 'number', 240),
  ('delivery_price',       'Delivery Price',          'მიწოდების ფასი',                 1, false, 'number', 250),
  ('extra_services',       'Extra Services',          'დამატ. სერვისები',               1, false, 'string', 260),
  ('extra_services_price', 'Extra Services Price',    'დამატ. სერვისები (ფასი)',        1, false, 'number', 270),
  ('shipment_type_raw',    'Type',                    'თიფი',                           1, false, 'string', 280),
  ('payment_type',         'Payment Type',            'ანგარიშსწ. ტიპი/გადამხდელი',     1, false, 'string', 290),
  ('payment_status',       'Payment Status',          'სტატუსი',                        2, false, 'string', 300),
  ('items_price',          'Items Price',             'ნივთების საფასური',              1, false, 'number', 310),
  ('cod_amount',           'COD Amount',              'COD - გადახდა კურიერთან',        1, false, 'number', 320),
  ('cod_fee',              'COD Fee',                 'COD საკომისიო',                  1, false, 'number', 330),
  ('company_receives',     'Company Receives',        'კომპანიას ერიცხება',             1, false, 'number', 340),
  ('spo',                  'SPO',                     'SPO',                            1, false, 'string', 350),
  ('extra_info',           'Extra Info',              'დამ. ინფ.',                      1, false, 'string', 360),
  ('sku',                  'SKU',                     NULL,                             1, false, 'string', 370);
