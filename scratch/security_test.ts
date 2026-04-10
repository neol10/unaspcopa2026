
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function securityCheck() {
  console.log('--- TEST 1: Unrestricted match score update (as Guest/Anon) ---');
  // Tentando atualizar o placar de uma partida aleatória
  const { data: match } = await supabase.from('matches').select('id').limit(1).single();
  
  if (!match) {
    console.log('No matches found to test.');
  } else {
    const { error } = await supabase
      .from('matches')
      .update({ team_a_score: 99 })
      .eq('id', match.id);

    if (error) {
      console.log('✅ Matches RLS Protected: Update failed as expected.', error.message);
    } else {
      console.log('❌ Matches RLS VULNERABLE: Update succeeded as Guest!');
    }
  }

  console.log('\n--- TEST 2: Unrestricted news creation (as Guest/Anon) ---');
  const { error: newsError } = await supabase
    .from('news')
    .insert([{ title: 'Hacked!', summary: 'This should not happen.' }]);
  
  if (newsError) {
    console.log('✅ News RLS Protected: Insert failed as expected.', newsError.message);
  } else {
    console.log('❌ News RLS VULNERABLE: Insert succeeded as Guest!');
  }

  console.log('\n--- TEST 3: Profiles role modification (as Guest/Anon) ---');
  // Tentando se promover a admin (supondo que o testador saiba seu ID ou chute um)
  const { error: authErr } = await supabase.from('profiles').update({ role: 'admin' }).eq('role', 'user');

  if (authErr) {
    console.log('✅ Profiles RLS Protected: Promotion failed.', authErr.message);
  } else {
    console.log('❌ Profiles RLS VULNERABLE: Promotion (mass update) succeeded!');
  }
}

securityCheck();
