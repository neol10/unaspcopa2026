const fs = require('fs');

let adminCode = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

// The block that is duplicated is:
//          name: normalizePlayerName(editFormData.name),
//          number: parseInt(editFormData.number) || 0,
//          goals_count: parseInt(editFormData.goals_count) || 0,
//          assists: parseInt(editFormData.assists) || 0,
//          yellow_cards: parseInt(editFormData.yellow_cards) || 0,
//          red_cards: parseInt(editFormData.red_cards) || 0,
//          clean_sheets: parseInt(editFormData.clean_sheets) || 0,
//          goals_conceded: parseInt((editFormData as any).goals_conceded) || 0,

const toRemove = `          name: normalizePlayerName(editFormData.name),
          number: parseInt(editFormData.number) || 0,
          goals_count: parseInt(editFormData.goals_count) || 0,
          assists: parseInt(editFormData.assists) || 0,
          yellow_cards: parseInt(editFormData.yellow_cards) || 0,
          red_cards: parseInt(editFormData.red_cards) || 0,
          clean_sheets: parseInt(editFormData.clean_sheets) || 0,
          goals_conceded: parseInt((editFormData as any).goals_conceded) || 0,
`;

if (adminCode.includes(toRemove)) {
  adminCode = adminCode.replace(toRemove, '');
  fs.writeFileSync('src/pages/Admin/Admin.tsx', adminCode, 'utf8');
  console.log('Removed duplicate block successfully!');
} else {
  console.log('Duplicate block NOT FOUND!');
}
