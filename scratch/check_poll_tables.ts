
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

async function checkPollsTables() {
  console.log('Checking poll_votes...');
  const { data: votes, error: votesError } = await supabase.from('poll_votes').select('*').limit(1);
  if (votesError) {
    console.error('Error poll_votes:', votesError.message);
  } else {
    console.log('poll_votes exists! Sample:', votes);
  }

  console.log('\nChecking profiles...');
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').limit(1);
  if (profilesError) {
    console.error('Error profiles:', profilesError.message);
  } else {
    console.log('profiles exists! Sample:', profiles);
  }
}

checkPollsTables();
