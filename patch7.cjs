const fs = require('fs');

let adminCode = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

const anchor = '      for (const gk of gks) {';
const searchBlock = `      for (const gk of gks) {
        if (!gk.team_id || teamsProcessed.has(gk.team_id)) continue;
        teamsProcessed.add(gk.team_id);
        const goals = teamGoalsAgainst[gk.team_id] || 0;`;

const replaceBlock = `      for (const gk of gks) {
        if (!gk.team_id) continue;
        const goals = teamGoalsAgainst[gk.team_id] || 0;`;

if (adminCode.includes(searchBlock)) {
  adminCode = adminCode.replace(searchBlock, replaceBlock);
  fs.writeFileSync('src/pages/Admin/Admin.tsx', adminCode, 'utf8');
  console.log('teamsProcessed bug fixed!');
} else {
  console.log('Block not found! Admin.tsx:');
  const idx = adminCode.indexOf('for (const gk of gks) {');
  if (idx !== -1) console.log(adminCode.substring(idx, idx + 200));
}
