const fs = require('fs');

// 1. Atualizar api/public-data.ts para incluir suspensions_served
let apiCode = fs.readFileSync('api/public-data.ts', 'utf8');
apiCode = apiCode.replace(
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, team_id, teams(name, badge_url, group, leader, primary_color)\')',
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, suspensions_served, team_id, teams(name, badge_url, group, leader, primary_color)\')'
);

// Fazer o replace também no fallback de public-data.ts
apiCode = apiCode.replace(
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, team_id\')',
  'select(\'id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, goals_conceded, suspensions_served, team_id\')'
);

fs.writeFileSync('api/public-data.ts', apiCode, 'utf8');
console.log('Adicionado suspensions_served no api/public-data.ts');
