
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfigSchema() {
  const { data, error } = await supabase.from('tournament_config').select('*').limit(1);
  if (error) {
    console.error('Error fetching config:', error.message);
  } else {
    console.log('Config data sample:', JSON.stringify(data?.[0], null, 2));
  }
}

checkConfigSchema();
