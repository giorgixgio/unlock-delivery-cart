import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://apkephplnoefbuxoyovr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwa2VwaHBsbm9lZmJ1eG95b3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDgwMTcsImV4cCI6MjA2MzMyNDAxN30.9gbG-WnBqzgJEdEH2M1HhU1H-E07qVG6QYv9NC5jbCg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as any, persistSession: false } });

async function main() {
  const { data, error } = await supabase
    .from('products')
    .select('id, title, description, available, price, sku, image, vendor')
    .eq('available', true)
    .eq('is_verified', true)
    .neq('sku', '')
    .order('sku', { ascending: true });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Count:', data?.length);

  const rows = (data || []).map((p: any) => {
    const link = `https://bigmart.ge/5for39?featured=${encodeURIComponent(p.sku)}`;
    const cleanDesc = (p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const price = Number(p.price || 0).toFixed(2);
    return {
      id: p.sku,
      title: p.title,
      description: cleanDesc,
      availability: 'in stock',
      condition: 'new',
      price: `${price} GEL`,
      link,
      image_link: p.image,
      brand: p.vendor || 'BIGMART',
      quantity_to_sell_on_facebook: '1',
    };
  });

  const header = Object.keys(rows[0] || {}).join(',');
  const csvLines = rows.map((r: any) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [header, ...csvLines].join('\n');
  fs.writeFileSync('/mnt/documents/meta_catalog_5for39_2026-08-09_v2.csv', csv);
  console.log('Wrote /mnt/documents/meta_catalog_5for39_2026-08-09_v2.csv');
  console.log('Data rows:', csvLines.length);
  console.log('Total lines:', csvLines.length + 1);
}

main();
