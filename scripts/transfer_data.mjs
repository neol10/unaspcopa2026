import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmxssuotlacqadbbfhou.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJteHNzdW90bGFjcWFkYmJmaG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjYxMjgsImV4cCI6MjA5NjUwMjEyOH0.GLFcZvB3TSsoBWien7dg-QaawOZcFbVliJhogEvkLCg';
const supabase = createClient(supabaseUrl, supabaseKey);

const stepsDir = 'C:\\Users\\neolu\\.gemini\\antigravity\\brain\\2849a1e4-909d-4fc6-931c-53586d6f3948\\.system_generated\\steps';
const stepDirs = fs.readdirSync(stepsDir);

async function transfer() {
  const tableData = {
    teams: [{"id":"41005c97-d2ec-4146-b18f-c054d1f3919d","name":"URUGUAI","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/uruuai_optimized_9fqbidbio34_1779663193146.webp","group":"A","leader":"GUSTAVO","primary_color":"#000000 ","division":"masculino","created_at":"2026-05-23T00:04:01.766835+00:00","updated_at":"2026-05-23T00:04:01.766835+00:00"},{"id":"5b48ab44-3ac4-4765-9812-a59a67efa4d7","name":"ALEMANHA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/germany-national-football-team-logo-0_optimized_p0ci4zccq1q_1779643934803.webp","group":"A","leader":"LUIZ GUSTAVO","primary_color":"#FFCC00","division":"masculino","created_at":"2026-05-23T00:03:31.690968+00:00","updated_at":"2026-05-23T00:03:31.690968+00:00"},{"id":"b39467b5-1613-4b30-8e66-d05a12ce2b0d","name":"ARGENTINA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/arg_optimized_64qihf1qs62_1779663110362.webp","group":"B","leader":"NEO LUCCA","primary_color":"#74ACDF","division":"masculino","created_at":"2026-05-22T23:38:39.027452+00:00","updated_at":"2026-05-22T23:38:39.027452+00:00"},{"id":"c4c3a709-c5cf-4221-aa4e-761f708352e3","name":"BRASIL","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/brasil_optimized_cadf91c1egq_1779663102063.webp","group":"A","leader":"JUNIOR","primary_color":"#FED100 ","division":"masculino","created_at":"2026-05-23T00:02:56.449468+00:00","updated_at":"2026-05-23T00:02:56.449468+00:00"},{"id":"4f543053-c67f-429d-9931-c42c38235df3","name":"ESPANHA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/espannha_zopo664gbyd_1779643996010.png","group":"B","leader":"TIAGO","primary_color":"#E21E26 ","division":"masculino","created_at":"2026-05-23T00:00:09.034167+00:00","updated_at":"2026-05-23T00:00:09.034167+00:00"},{"id":"f262bc41-c089-49fe-8db0-eb48b85e88b9","name":"FRANÇA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/franca_optimized_fsvudk52c7v_1779663118922.webp","group":"A","leader":"FERNANDINHO","primary_color":"#0A1F44 ","division":"masculino","created_at":"2026-05-23T00:04:27.343299+00:00","updated_at":"2026-05-23T00:04:27.343299+00:00"},{"id":"c0ee015e-bca9-405d-82d1-e3346cc97212","name":"HOLANDA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/holanda_ousa1fbvxuq_1779663201304.png","group":"B","leader":"RICARDO","primary_color":"#F36C21 ","division":"masculino","created_at":"2026-05-23T00:00:56.564982+00:00","updated_at":"2026-05-23T00:00:56.564982+00:00"},{"id":"568927b9-2610-4361-80e5-302a6774cbea","name":"INGLATERRA","badge_url":"https://ronvuuxdkgiwgjuqzobt.supabase.co/storage/v1/object/public/images/team-badges/ing_optimized_kkpyk0b5f3s_1779663557431.webp","group":"B","leader":"MIGUEL","primary_color":"#FFFFFF ","division":"masculino","created_at":"2026-05-23T00:02:09.029715+00:00","updated_at":"2026-05-23T00:02:09.029715+00:00"}]
  };

  for (const dir of stepDirs) {
    const p = path.join(stepsDir, dir, 'output.txt');
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, 'utf8');
        const firstBracket = text.indexOf('[{');
        const lastBracket = text.lastIndexOf('}]');
        
        if (firstBracket !== -1 && lastBracket !== -1) {
          const jsonStr = text.substring(firstBracket, lastBracket + 2);
          const unescaped = jsonStr.replace(/\\n/g, '').replace(/\\"/g, '"');
          let json;
          try {
            json = JSON.parse(unescaped);
          } catch (e) {
            json = JSON.parse(jsonStr);
          }
          
          if (json && json.length > 0 && json[0].json_agg) {
            const rows = json[0].json_agg;
            if (!rows || rows.length === 0) continue;
            
            let tableName = '';
            const sample = rows[0];
            if ('badge_url' in sample) tableName = 'teams';
            else if ('position' in sample) tableName = 'players';
            else if ('team_a_score' in sample) tableName = 'matches';
            else if ('event_type' in sample) tableName = 'match_events';
            else if ('vote' in sample) tableName = 'match_winner_votes';
            else if ('options' in sample) tableName = 'polls';
            else if ('option_id' in sample) tableName = 'poll_votes';
            else if ('player_id' in sample && 'round' in sample) tableName = 'round_mvp_votes';
            else if ('player_id' in sample && 'match_id' in sample && !('commentary' in sample)) tableName = 'match_mvp_votes';
            else if ('current_phase' in sample) tableName = 'tournament_config';
            else {
                console.log('Unknown table for keys:', Object.keys(sample));
                continue;
            }
            
            tableData[tableName] = rows.map(r => {
                if (tableName === 'match_winner_votes' || tableName === 'poll_votes' || tableName === 'round_mvp_votes' || tableName === 'match_mvp_votes' || tableName === 'match_events') {
                    r.user_id = null; // drop user references
                }
                return r;
            });
          }
        }
      } catch (e) {
        console.error('Error parsing JSON from', dir, e.message);
      }
    }
  }

  // Insert order matters for foreign keys
  const order = ['match_winner_votes', 'match_mvp_votes', 'round_mvp_votes', 'poll_votes', 'polls', 'match_events'];
  
  for (const table of order) {
    if (tableData[table]) {
      console.log(`Inserting ${tableData[table].length} rows into ${table}...`);
      // insert in batches of 50
      for (let i = 0; i < tableData[table].length; i += 50) {
        const batch = tableData[table].slice(i, i + 50);
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
          console.error(`Error inserting into ${table}:`, error.message);
        }
      }
    }
  }
  
  console.log('Transfer complete!');
}

transfer();
