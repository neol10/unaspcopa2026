const fs = require('fs');

let code = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');
const lines = code.split('\n');

// Linhas 8911-8916 (index 8910-8915) precisam ser substituídas
// Atual (corrompido):
//   {!loading && filteredPlayers.length > visibleLimit && (
//     <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
//           </button>
//         </div>
//
//         <form ... onSubmit={handleUpdatePlayer}>   <-- ERRADO, modal não deveria estar aqui

// Correto:
//   {!loading && filteredPlayers.length > visibleLimit && (
//     <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
//       <button className="btn-add" type="button" onClick={...}>Carregar mais</button>
//     </div>
//   )}
//
//   {editingGlobalPlayerId && typeof document !== 'undefined' && createPortal(
//     <div className="global-player-edit-modal-backdrop" onClick={() => setEditingGlobalPlayerId(null)}>
//       <div className="global-player-edit-modal glass" onClick={(e) => e.stopPropagation()}>
//         <div className="global-player-edit-modal-header">
//           <h3>Editar Atleta</h3>
//           <button type="button" className="btn-cancel" onClick={() => setEditingGlobalPlayerId(null)}>Fechar</button>
//         </div>
//         <form ... onSubmit={...handleUpdateGlobalPlayer}>   <-- CORRETO

const CORRUPTED = `      {!loading && filteredPlayers.length > visibleLimit && (\n        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>\n              </button>\n            </div>\n\n            <form className="admin-form glass global-player-edit-form" onSubmit={handleUpdatePlayer}>`;

const FIXED = `      {!loading && filteredPlayers.length > visibleLimit && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            className="btn-add"
            type="button"
            onClick={() => setVisibleLimit((prev) => Math.min(prev + 200, filteredPlayers.length))}
          >
            Carregar mais ({visiblePlayers.length}/{filteredPlayers.length})
          </button>
        </div>
      )}

      {editingGlobalPlayerId && typeof document !== 'undefined' && createPortal(
        <div className="global-player-edit-modal-backdrop" onClick={() => setEditingGlobalPlayerId(null)}>
          <div className="global-player-edit-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="global-player-edit-modal-header">
              <h3>Editar Atleta</h3>
              <button type="button" className="btn-cancel" onClick={() => setEditingGlobalPlayerId(null)}>
                Fechar
              </button>
            </div>

            <form className="admin-form glass global-player-edit-form" onSubmit={(e) => { e.preventDefault(); void handleUpdateGlobalPlayer(); }}>`;

if (code.includes(CORRUPTED)) {
  code = code.replace(CORRUPTED, FIXED);
  console.log('Corrigido com sucesso!');
} else {
  console.log('String corrompida nao encontrada, tentando abordagem por linhas...');
  
  // Abordagem alternativa: substituir linha a linha
  const idx = code.indexOf('onSubmit={handleUpdatePlayer}');
  if (idx !== -1) {
    code = code.replace('onSubmit={handleUpdatePlayer}', 'onSubmit={(e) => { e.preventDefault(); void handleUpdateGlobalPlayer(); }}');
    console.log('Substituiu onSubmit={handleUpdatePlayer} -> handleUpdateGlobalPlayer');
  }
  
  // Também corrigir o bloco "Carregar mais" corrompido
  const badCarregar = `      {!loading && filteredPlayers.length > visibleLimit && (\n        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>\n              </button>\n            </div>`;
  const goodCarregar = `      {!loading && filteredPlayers.length > visibleLimit && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            className="btn-add"
            type="button"
            onClick={() => setVisibleLimit((prev) => Math.min(prev + 200, filteredPlayers.length))}
          >
            Carregar mais ({visiblePlayers.length}/{filteredPlayers.length})
          </button>
        </div>
      )}

      {editingGlobalPlayerId && typeof document !== 'undefined' && createPortal(
        <div className="global-player-edit-modal-backdrop" onClick={() => setEditingGlobalPlayerId(null)}>
          <div className="global-player-edit-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="global-player-edit-modal-header">
              <h3>Editar Atleta</h3>
              <button type="button" className="btn-cancel" onClick={() => setEditingGlobalPlayerId(null)}>
                Fechar
              </button>
            </div>

            <form className="admin-form glass global-player-edit-form" onSubmit={(e) => { e.preventDefault(); void handleUpdateGlobalPlayer(); }}>`;
  
  if (code.includes(badCarregar)) {
    code = code.replace(badCarregar, goodCarregar);
    console.log('Corrigiu bloco Carregar mais + modal');
  } else {
    console.log('Nao encontrou bloco Carregar mais corrompido. Verificando manualmente...');
    const problemLine = '              </button>\n            </div>\n\n            <form';
    const idx2 = code.indexOf(problemLine);
    console.log('Pos do problema:', idx2);
    if (idx2 !== -1) {
      console.log('Contexto:', code.substring(idx2 - 200, idx2 + 200));
    }
  }
}

fs.writeFileSync('src/pages/Admin/Admin.tsx', code, 'utf8');
console.log('Arquivo salvo.');
