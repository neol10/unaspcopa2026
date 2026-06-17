const fs = require('fs');
let code = fs.readFileSync('src/hooks/useRankings.ts', 'utf8');

const fastFetchLogic = `
        if (!payload) {
          // Busca paralela para acelerar
          const [playersRes, matchesRes] = await Promise.all([
            supabasePublic.from('players')
              .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, team_id, teams(name, badge_url, group, leader, primary_color)')
              .eq('division', division),
            supabasePublic.from('matches')
              .select('id, match_date, round, night, status, match_mvp_player_id, match_mvp_description, team_a_id, team_b_id, team_a_score, team_b_score')
              .eq('division', division)
              .order('match_date', { ascending: true })
          ]);

          let votesData: { player_id: string; match_id: string }[] = [];
          let eventsData: { match_id: string; player_id: string | null; assistant_id: string | null; event_type: string; minute: number; metadata: unknown }[] = [];

          const matchIds = (matchesRes.data || []).map((m) => m.id).filter(Boolean) as string[];

          if (matchIds.length > 0) {
            const CHUNK = 150; // Maior chunk
            const fetchAllInBatchesConcurrent = async <Row,>(
              queryFactory: (ids: string[]) => Promise<{ data: Row[] | null; error: unknown }>
            ): Promise<Row[]> => {
              const promises = [];
              for (let i = 0; i < matchIds.length; i += CHUNK) {
                const ids = matchIds.slice(i, i + CHUNK);
                promises.push(queryFactory(ids));
              }
              const results = await Promise.all(promises);
              const rows: Row[] = [];
              results.forEach(({ data, error }) => {
                if (!error && Array.isArray(data)) rows.push(...data);
              });
              return rows;
            };

            const [votes, events] = await Promise.all([
              fetchAllInBatchesConcurrent<{ player_id: string; match_id: string }>((ids) =>
                supabasePublic.from('match_mvp_votes').select('player_id, match_id').in('match_id', ids)
              ),
              fetchAllInBatchesConcurrent<{ match_id: string; player_id: string | null; assistant_id: string | null; event_type: string; minute: number; metadata: unknown }>((ids) =>
                supabasePublic.from('match_events').select('match_id, player_id, assistant_id, event_type, minute, metadata').in('match_id', ids).in('event_type', ['gol', 'assistencia'])
              )
            ]);

            votesData = votes;
            eventsData = events;
          }

          payload = {
            players: playersRes.data || [],
            matches: matchesRes.data || [],
            votes: votesData,
            events: eventsData,
          };
        }
`;

// Substituir a lógica antiga lenta pela nova rápida
const startIdx = code.indexOf('if (!payload) {');
const endIdx = code.indexOf('console.log(\'[Rankings] Fetch took\'');

if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + fastFetchLogic + '        ' + code.substring(endIdx);
  fs.writeFileSync('src/hooks/useRankings.ts', code, 'utf8');
  console.log('useRankings.ts foi otimizado para fetch paralelo!');
} else {
  console.log('Não foi possível encontrar as tags para substituição no useRankings.ts');
}
