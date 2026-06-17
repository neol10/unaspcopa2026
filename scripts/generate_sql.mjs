import fs from 'fs';
import path from 'path';

const stepsDir = 'C:\\Users\\neolu\\.gemini\\antigravity\\brain\\2849a1e4-909d-4fc6-931c-53586d6f3948\\.system_generated\\steps';
const stepDirs = fs.readdirSync(stepsDir);

let allSql = 'begin;\n\n';

for (const dir of stepDirs) {
  const p = path.join(stepsDir, dir, 'output.txt');
  if (fs.existsSync(p)) {
    try {
      const text = fs.readFileSync(p, 'utf8');
      
      const firstBracket = text.indexOf('[{');
      const lastBracket = text.lastIndexOf('}]');
      
      if (firstBracket !== -1 && lastBracket !== -1) {
        const jsonStr = text.substring(firstBracket, lastBracket + 2);
        // Clean up escaped newlines or quotes if it was within a JSON string
        const unescaped = jsonStr.replace(/\\n/g, '').replace(/\\"/g, '"');
        let json;
        try {
          json = JSON.parse(unescaped);
        } catch (e) {
           // If it fails, maybe it's already a valid string because it was parsed differently
           json = JSON.parse(jsonStr);
        }
        
        if (json && json.length > 0 && json[0].json_agg) {
          const rows = json[0].json_agg;
          if (!rows || rows.length === 0) continue;
          
          let tableName = '';
          const sample = rows[0];
          if ('badge_url' in sample) tableName = 'public.teams';
          else if ('position' in sample) tableName = 'public.players';
          else if ('team_a_score' in sample) tableName = 'public.matches';
          else if ('event_type' in sample) tableName = 'public.match_events';
          else if ('vote' in sample) tableName = 'public.match_winner_votes';
          else if ('options' in sample) tableName = 'public.polls';
          else if ('option_id' in sample) tableName = 'public.poll_votes';
          else if ('player_id' in sample && 'round' in sample) tableName = 'public.round_mvp_votes';
          else if ('player_id' in sample && 'match_id' in sample && !('commentary' in sample)) tableName = 'public.match_mvp_votes';
          else if ('current_phase' in sample) tableName = 'public.tournament_config';
          else {
              console.log('Unknown table for keys:', Object.keys(sample));
              continue;
          }

          console.log(`Found ${rows.length} rows for ${tableName}`);

          const keys = Object.keys(sample);
          
          allSql += `\n-- Inserting into ${tableName}\n`;
          for (const row of rows) {
              const vals = keys.map(k => {
                  const val = row[k];
                  if (val === null) return 'NULL';
                  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                  return val;
              });
              allSql += `INSERT INTO ${tableName} ("${keys.join('","')}") VALUES (${vals.join(',')}) ON CONFLICT DO NOTHING;\n`;
          }
        }
      }
    } catch (e) {
      console.error('Error parsing JSON from', dir, e.message);
    }
  }
}

allSql += '\ncommit;\n';

fs.writeFileSync('C:\\Users\\neolu\\OneDrive\\compactadas\\copaunasp\\scripts\\inserts.sql', allSql);
console.log('Done!');
