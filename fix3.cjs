const fs = require('fs');
let code = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

// Adicionar handleEditPhotoUpload logo após handlePhotoUpload no componente global (linha ~8387)
const AFTER = `  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToStorage(file, 'images', 'player-photos');
    if (url) {
      setFormData(prev => ({ ...prev, photo_url: url }));
      toast.success('Foto carregada!');
    }
    setUploading(false);
  };`;

const INSERT = `\r\n\r\n  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {\r\n    const file = e.target.files?.[0];\r\n    if (!file) return;\r\n    setUploading(true);\r\n    const url = await uploadToStorage(file, 'images', 'player-photos');\r\n    if (url) setEditFormData(prev => ({ ...prev, photo_url: url }));\r\n    setUploading(false);\r\n  };`;

// Encontrar a segunda ocorrência de handlePhotoUpload (no componente global)
const first = code.indexOf('const handlePhotoUpload');
const second = code.indexOf('const handlePhotoUpload', first + 1);
console.log('Primeira ocorrência:', first, '| Segunda:', second);

if (second !== -1) {
  // Achar o fim dessa função (o fechamento do bloco };)
  const endOfFn = code.indexOf('\n\n  const handleAddPlayer', second);
  console.log('Fim da função (antes de handleAddPlayer):', endOfFn);
  
  if (endOfFn !== -1) {
    code = code.substring(0, endOfFn) + INSERT + code.substring(endOfFn);
    fs.writeFileSync('src/pages/Admin/Admin.tsx', code, 'utf8');
    console.log('handleEditPhotoUpload inserido com sucesso!');
  } else {
    console.log('Não encontrou o ponto de inserção');
  }
} else {
  console.log('Não encontrou segunda ocorrência de handlePhotoUpload');
}
