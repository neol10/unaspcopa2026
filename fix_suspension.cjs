const fs = require('fs');

// 1. Atualizar useRankings.ts
let code = fs.readFileSync('src/hooks/useRankings.ts', 'utf8');
code = code.replace(
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, team_id, teams(name, badge_url, group, leader, primary_color)\')',
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, suspensions_served, team_id, teams(name, badge_url, group, leader, primary_color)\')'
);

fs.writeFileSync('src/hooks/useRankings.ts', code, 'utf8');
console.log('Adicionado suspensions_served no fetch do useRankings.ts');

// 2. Adicionar o chip no Rankings.tsx
let rankingsCode = fs.readFileSync('src/pages/Rankings/Rankings.tsx', 'utf8');

if (!rankingsCode.includes('import { getPendingSuspension }')) {
  rankingsCode = rankingsCode.replace(
    'import { Trophy, Activity, ShieldAlert, Zap, User, Download, Search } from \'lucide-react\';',
    `import { Trophy, Activity, ShieldAlert, Zap, User, Download, Search } from 'lucide-react';\nimport { getPendingSuspension } from '../../lib/discipline';`
  );
}

// Em `activeTab === 'disciplined'`
const searchPoint = '<div className="rank-cards">';
if (rankingsCode.includes(searchPoint)) {
  const replacement = `
                    {(() => {
                      const susp = getPendingSuspension(p);
                      return susp.isSuspended ? (
                        <div className="rank-suspension-badge" title={\`\${susp.pendingGames} jogo(s) de suspensão\`}>
                          SUSPENSO
                        </div>
                      ) : null;
                    })()}
                    <div className="rank-cards">`;
  
  rankingsCode = rankingsCode.replace(searchPoint, replacement);
  fs.writeFileSync('src/pages/Rankings/Rankings.tsx', rankingsCode, 'utf8');
  console.log('Adicionado chip de suspenso em Rankings.tsx');
}

// 3. Adicionar estilo no Rankings.css
let css = fs.readFileSync('src/pages/Rankings/Rankings.css', 'utf8');
if (!css.includes('.rank-suspension-badge')) {
  css += `\n
.rank-suspension-badge {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
  font-size: 0.6rem;
  font-weight: 800;
  padding: 3px 6px;
  border-radius: 4px;
  margin-right: 8px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
`;
  fs.writeFileSync('src/pages/Rankings/Rankings.css', css, 'utf8');
  console.log('Estilos CSS atualizados!');
}
