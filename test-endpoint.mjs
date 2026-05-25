import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const start = Date.now();
  console.log('Fetching players...');
  const res = await supabase.from('players').select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams(name, badge_url, group, leader, primary_color)');
  const end = Date.now();
  console.log('Status:', res.status, res.statusText);
  if (res.error) console.log('Error:', res.error);
  console.log(`Took ${end - start} ms`);
  if (res.data) {
     const str = JSON.stringify(res.data);
     console.log('Payload size:', str.length / 1024, 'KB');
  }
}
run();
