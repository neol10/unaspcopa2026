const fs = require('fs');
let code = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

const OLD = `<form className="admin-form glass global-player-edit-form" onSubmit={handleUpdatePlayer}>`;
const NEW = `<form className="admin-form glass global-player-edit-form" onSubmit={(e) => { e.preventDefault(); void handleUpdateGlobalPlayer(); }}>`;

if (code.includes(OLD)) {
  code = code.replace(OLD, NEW);
  fs.writeFileSync('src/pages/Admin/Admin.tsx', code, 'utf8');
  console.log('Corrigido!');
} else {
  console.log('String nao encontrada. Verificando variações...');
  // Verificar com \r\n
  const idx = code.indexOf('onSubmit={handleUpdatePlayer}');
  console.log('Posição onSubmit={handleUpdatePlayer}:', idx);
  if (idx !== -1) {
    console.log('Contexto:', JSON.stringify(code.substring(idx - 50, idx + 80)));
  }
}
