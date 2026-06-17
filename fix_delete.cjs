const fs = require('fs');
let code = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

const getDeletePlayerErrorMessage = `
const getDeletePlayerErrorMessage = (err: unknown): string => {
  const code = getPostgresCode(err);
  if (code === '23503') {
    return 'Não foi possível excluir: O atleta possui histórico na competição (ex: eventos de partida).';
  }
  return getErrorMessage(err, 'Erro ao excluir atleta');
};
`;

if (!code.includes('const getDeletePlayerErrorMessage')) {
  code = code.replace('const getDeleteMatchErrorMessage', getDeletePlayerErrorMessage + '\nconst getDeleteMatchErrorMessage');
}

// Em handleDelete (Team modal)
code = code.replace(
  `toast.error(getErrorMessage(err, 'Erro ao excluir atleta')`,
  `console.error("Erro ao excluir atleta:", err); toast.error(getDeletePlayerErrorMessage(err)`
);

fs.writeFileSync('src/pages/Admin/Admin.tsx', code, 'utf8');
console.log('Adicionado logging e mensagem clara para FK violation!');
