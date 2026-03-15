import { supabase } from './src/lib/supabase';

async function checkTable() {
  const { data, error } = await supabase.from('match_mvp_votes').select('*').limit(1);
  if (error) {
    console.log('Error or table missing:', error.message);
  } else {
    console.log('Table exists!');
  }
}

checkTable();
