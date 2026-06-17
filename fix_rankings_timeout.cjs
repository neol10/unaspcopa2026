const fs = require('fs');
let code = fs.readFileSync('src/pages/Rankings/Rankings.tsx', 'utf8');

// Aumentar o timeout de 15s para 25s
code = code.replace('setTimeout(() => setStuck(true), 15000);', 'setTimeout(() => setStuck(true), 25000);');

fs.writeFileSync('src/pages/Rankings/Rankings.tsx', code, 'utf8');
console.log('Timeout do Rankings alterado para 25s');
