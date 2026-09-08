CREATE TABLE public.city_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_normalized text NOT NULL UNIQUE,
  canonical_city text NOT NULL,
  zone_id integer,
  source text NOT NULL CHECK (source IN ('latin','cyrillic','typo','manual_split','operator_confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_aliases TO authenticated;
GRANT ALL ON public.city_aliases TO service_role;

ALTER TABLE public.city_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage city aliases"
ON public.city_aliases FOR ALL TO authenticated
USING (public.is_active_staff(auth.uid()) OR public.is_active_admin(auth.uid()))
WITH CHECK (public.is_active_staff(auth.uid()) OR public.is_active_admin(auth.uid()));

INSERT INTO public.city_aliases (alias_normalized, canonical_city, zone_id, source)
SELECT v.alias, v.canonical, z.zone_id, v.source
FROM (VALUES
  ('tbilisi','თბილისი','latin'),
  ('tbilissi','თბილისი','latin'),
  ('tiflis','თბილისი','latin'),
  ('თბილისი','თბილისი','typo'),
  ('тбилиси','თბილისი','cyrillic'),
  ('თბლისი','თბილისი','typo'),
  ('თბილს','თბილისი','typo'),
  ('თბილის','თბილისი','typo'),
  ('თბილისიi','თბილისი','typo'),
  ('თბილისო','თბილისი','typo'),
  ('batumi','ბათუმი','latin'),
  ('батуми','ბათუმი','cyrillic'),
  ('ბათუმ','ბათუმი','typo'),
  ('ბატუმი','ბათუმი','typo'),
  ('kutaisi','ქუთაისი','latin'),
  ('кутаиси','ქუთაისი','cyrillic'),
  ('ქუთაის','ქუთაისი','typo'),
  ('ქუტაისი','ქუთაისი','typo'),
  ('rustavi','რუსთავი','latin'),
  ('рустави','რუსთავი','cyrillic'),
  ('რუსთავ','რუსთავი','typo'),
  ('რუსტავი','რუსთავი','typo'),
  ('zugdidi','ზუგდიდი','latin'),
  ('зугдиди','ზუგდიდი','cyrillic'),
  ('ზუგდიდ','ზუგდიდი','typo'),
  ('gori','გორი','latin'),
  ('гори','გორი','cyrillic'),
  ('telavi','თელავი','latin'),
  ('телави','თელავი','cyrillic'),
  ('ტელავი','თელავი','typo'),
  ('kobuleti','ქობულეთი','latin'),
  ('кобулети','ქობულეთი','cyrillic'),
  ('ქობულეთ','ქობულეთი','typo'),
  ('poti','ფოთი','latin'),
  ('поти','ფოთი','cyrillic'),
  ('ozurgeti','ოზურგეთი','latin'),
  ('озургети','ოზურგეთი','cyrillic'),
  ('marneuli','მარნეული','latin'),
  ('марнеули','მარნეული','cyrillic'),
  ('khashuri','ხაშური','latin'),
  ('хашури','ხაშური','cyrillic'),
  ('samtredia','სამტრედია','latin'),
  ('самтредиа','სამტრედია','cyrillic'),
  ('senaki','სენაკი','latin'),
  ('сенаки','სენაკი','cyrillic'),
  ('akhaltsikhe','ახალციხე','latin'),
  ('ахалцихе','ახალციხე','cyrillic'),
  ('borjomi','ბორჯომი','latin'),
  ('боржоми','ბორჯომი','cyrillic'),
  ('zestafoni','ზესტაფონი','latin'),
  ('zestaponi','ზესტაფონი','latin'),
  ('зестафони','ზესტაფონი','cyrillic'),
  ('mtskheta','მცხეთა','latin'),
  ('мцхета','მცხეთა','cyrillic'),
  ('gurjaani','გურჯაანი','latin'),
  ('гурджаани','გურჯაანი','cyrillic'),
  ('kaspi','კასპი','latin'),
  ('bolnisi','ბოლნისი','latin'),
  ('gardabani','გარდაბანი','latin'),
  ('tsqaltubo','წყალტუბო','latin'),
  ('tskaltubo','წყალტუბო','latin'),
  ('lanchkhuti','ლანჩხუთი','latin'),
  ('sagarejo','საგარეჯო','latin'),
  ('kvareli','ყვარელი','latin'),
  ('kareli','ქარელი','latin'),
  ('khoni','ხონი','latin'),
  ('tkibuli','ტყიბული','latin'),
  ('chiatura','ჭიათურა','latin'),
  ('sachkhere','საჩხერე','latin'),
  ('lagodekhi','ლაგოდეხი','latin'),
  ('signagi','სიღნაღი','latin'),
  ('dusheti','დუშეთი','latin')
) AS v(alias, canonical, source)
LEFT JOIN public.courier_zone_codes z
  ON lower(trim(z.city_name)) = lower(trim(v.canonical))
ON CONFLICT (alias_normalized) DO NOTHING;