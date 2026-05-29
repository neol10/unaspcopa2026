const fs = require('fs');
let text = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

text = text.replace(/clean_sheets: '0'/g, "clean_sheets: '0', goals_conceded: '0'");

text = text.replace(/clean_sheets: parseInt\(editFormData\.clean_sheets\) \|\| 0,/g, "clean_sheets: parseInt(editFormData.clean_sheets) || 0,\n          goals_conceded: parseInt((editFormData as any).goals_conceded) || 0,");
text = text.replace(/clean_sheets: parseInt\(formData\.clean_sheets\) \|\| 0,/g, "clean_sheets: parseInt(formData.clean_sheets) || 0,\n        goals_conceded: parseInt((formData as any).goals_conceded) || 0,");

text = text.replace(/clean_sheets: String\(p\.clean_sheets \|\| 0\),/g, "clean_sheets: String(p.clean_sheets || 0),\n                      goals_conceded: String((p as any).goals_conceded || 0),");

const cleanSheetsInput1 = `<input type="number" value={formData.clean_sheets} onChange={e => setFormData({...formData, clean_sheets: e.target.value})} />`;
const replacement1 = cleanSheetsInput1 + `
                </div>
                {formData.position === 'Goleiro' && (
                  <div className="admin-form-group">
                    <label>Gols Sofridos (Apenas Goleiro)</label>
                    <input type="number" value={(formData as any).goals_conceded} onChange={e => setFormData({...formData, goals_conceded: e.target.value})} />
                  </div>
                )}
                <div style={{display:'none'}}>`;
text = text.replace(cleanSheetsInput1, replacement1);

const cleanSheetsInput2 = `<input type="number" value={editFormData.clean_sheets} onChange={e => setEditFormData({ ...editFormData, clean_sheets: e.target.value })} />`;
const replacement2 = cleanSheetsInput2 + `
                  </div>
                  {editFormData.position === 'Goleiro' && (
                    <div className="admin-form-group">
                      <label>Gols Sofridos (Apenas Goleiro)</label>
                      <input type="number" value={(editFormData as any).goals_conceded} onChange={e => setEditFormData({...editFormData, goals_conceded: e.target.value})} />
                    </div>
                  )}
                  <div style={{display:'none'}}>`;
text = text.replace(new RegExp(cleanSheetsInput2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement2);

text = text.replace(/clean_sheets, teams\(name\)/g, 'clean_sheets, goals_conceded, teams(name)');

// Add missing column error handler inside handleUpdatePlayer
const updateBlockOld = `
      const { error } = await withTimeout(
        supabase.from('players').update({
`;
const updateBlockNew = `
      const payload: any = {
        ...editFormData,
        name: normalizePlayerName(editFormData.name),
        number: parseInt(editFormData.number) || 0,
        goals_count: parseInt(editFormData.goals_count) || 0,
        assists: parseInt(editFormData.assists) || 0,
        yellow_cards: parseInt(editFormData.yellow_cards) || 0,
        red_cards: parseInt(editFormData.red_cards) || 0,
        clean_sheets: parseInt(editFormData.clean_sheets) || 0,
        suspensions_served: Math.max(0, parseInt(editFormData.suspensions_served) || 0),
      };
      if (editFormData.position === 'Goleiro') {
        payload.goals_conceded = parseInt((editFormData as any).goals_conceded) || 0;
      }
      
      const { error } = await withTimeout(
        supabase.from('players').update(payload).eq('id', playerId),
        30000,
        'Tempo limite'
      );
      if (error && error.code === '42703' && String(error.message).includes('goals_conceded')) {
        toast.error('Você precisa criar a coluna "goals_conceded" (int8) na tabela players do Supabase!', { duration: 10000 });
        setIsUpdatingPlayer(false);
        return;
      }
      //`;
      
text = text.replace(/const { error } = await withTimeout\([\s\S]*?\}\)\.eq\('id', playerId\),[\s\S]*?'Tempo limite'[\s\S]*?\);/, updateBlockNew);

fs.writeFileSync('src/pages/Admin/Admin.tsx', text);
console.log('Admin.tsx updated via JS');
