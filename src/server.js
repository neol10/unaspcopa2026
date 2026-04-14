import express from "express";

// Cria a aplicação Express
const app = express();

// Define a porta em que o servidor vai rodar
const PORT = 3000;

// ========================================
// CONFIGURAÇÃO INICIAL
// ========================================

// Permite que o servidor entenda JSON enviado no corpo da requisição
app.use(express.json());

// ========================================
// DADOS EM MEMÓRIA
// ========================================

// Array que armazena as tarefas temporariamente
// Observação importante para os alunos:
// esses dados somem quando o servidor reinicia
const tarefas = [
  { id: 1, descricao: "Estudar química", concluida: false, noite: 1 },
  { id: 2, descricao: "Criar páginas no Figma", concluida: true, noite: 1 }
];

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

/**
 * Procura o índice de uma tarefa no array com base no id
 * Retorna:
 * - o índice da tarefa, se encontrar
 * - -1, se não encontrar
 */
function encontrarIndiceTarefa(id) {
  for (let i = 0; i < tarefas.length; i++) {
    if (tarefas[i].id === id) {
      return i;
    }
  }
  return -1;
}

/**
 * Gera um novo id para a próxima tarefa
 * Se o array estiver vazio, começa com 1
 * Caso contrário, pega o maior id existente e soma 1
 */
function gerarNovoId() {
  if (tarefas.length === 0) return 1;

  let maiorId = 0;
  for (let i = 0; i < tarefas.length; i++) {
    if (tarefas[i].id > maiorId) {
      maiorId = tarefas[i].id;
    }
  }

  return maiorId + 1;
}

/**
 * Retorna todas as tarefas cadastradas
 */
function obterTodasTarefas() {
  return tarefas;
}

/**
 * Procura uma tarefa específica pelo id
 * Retorna a tarefa encontrada ou null
 */
function obterTarefaPorId(id) {
  const indice = encontrarIndiceTarefa(id);

  if (indice === -1) return null;

  return tarefas[indice];
}

/**
 * Cria uma nova tarefa
 * A descrição é limpa com trim() para remover espaços extras
 * Toda nova tarefa começa com concluida = false
 */
function criarNovaTarefa(descricao, noite) {
  const novaTarefa = {
    id: gerarNovoId(),
    descricao: descricao.trim(),
    concluida: false,
    noite: noite !== undefined ? noite : 1
  };

  tarefas.push(novaTarefa);
  return novaTarefa;
}

/**
 * Atualiza uma tarefa existente
 * Pode atualizar:
 * - a descrição
 * - o status de conclusão
 *
 * Retorna:
 * - a tarefa atualizada, se encontrar
 * - null, se não encontrar
 */
function atualizarTarefa(id, novaDescricao, novoStatus, novaNoite) {
  const indice = encontrarIndiceTarefa(id);

  if (indice === -1) return null;

  const tarefa = tarefas[indice];

  // Atualiza a descrição apenas se ela foi enviada
  if (novaDescricao !== undefined) {
    tarefa.descricao = novaDescricao.trim();
  }

  // Atualiza o status apenas se ele foi enviado
  if (novoStatus !== undefined) {
    tarefa.concluida = novoStatus;
  }

  // Atualiza a noite apenas se ela foi enviada
  if (novaNoite !== undefined) {
    tarefa.noite = novaNoite;
  }

  return tarefa;
}

/**
 * Exclui uma tarefa pelo id
 * Retorna:
 * - a tarefa removida, se encontrar
 * - null, se não encontrar
 */
function excluirTarefa(id) {
  const indice = encontrarIndiceTarefa(id);

  if (indice === -1) return null;

  const tarefaRemovida = tarefas[indice];

  // Remove 1 elemento do array na posição encontrada
  tarefas.splice(indice, 1);

  return tarefaRemovida;
}

// ========================================
// ROTAS DA API
// ========================================

/**
 * GET /
 * Rota inicial apenas para testar se a API está funcionando
 */
app.get("/", (req, res) => {
  res.send("API de tarefas funcionando!");
});

/**
 * GET /tarefas
 * Retorna todas as tarefas em formato JSON
 */
app.get("/tarefas", (req, res) => {
  res.json(obterTodasTarefas());
});

/**
 * GET /tarefas/:id
 * Retorna uma tarefa específica com base no id enviado na URL
 */
app.get("/tarefas/:id", (req, res) => {
  // Converte o id recebido pela URL para número
  const idNumero = Number(req.params.id);

  // Valida se o id é realmente um número
  if (Number.isNaN(idNumero)) {
    return res.status(400).json({ erro: "ID inválido" });
  }

  // Busca a tarefa pelo id
  const tarefa = obterTarefaPorId(idNumero);

  // Se não encontrar, retorna erro 404
  if (!tarefa) {
    return res.status(404).json({ erro: "Tarefa não encontrada" });
  }

  // Se encontrar, retorna a tarefa
  res.json(tarefa);
});

/**
 * POST /tarefas
 * Cria uma nova tarefa
 */
app.post("/tarefas", (req, res) => {
  // Pega a descrição e noite enviadas no corpo da requisição
  const { descricao, noite } = req.body;

  // Valida se a descrição foi enviada corretamente
  if (typeof descricao !== "string" || descricao.trim() === "") {
    return res.status(400).json({ erro: "Descrição é obrigatória" });
  }

  // Valida a noite, se enviada
  if (noite !== undefined && (typeof noite !== "number" || noite < 1)) {
    return res.status(400).json({ erro: "Noite deve ser um número maior que 0" });
  }

  // Cria a nova tarefa
  const tarefaCriada = criarNovaTarefa(descricao, noite);

  // Retorna status 201 (criado com sucesso)
  res.status(201).json({
    mensagem: "Tarefa criada com sucesso!",
    tarefa: tarefaCriada
  });
});

/**
 * PATCH /tarefas/:id
 * Atualiza parcialmente uma tarefa existente
 */
app.patch("/tarefas/:id", (req, res) => {
  // Converte o id da URL para número
  const idNumero = Number(req.params.id);

  // Pega os dados enviados no corpo da requisição
  const { descricao, concluida, noite } = req.body;

  // Valida o id
  if (Number.isNaN(idNumero)) {
    return res.status(400).json({ erro: "ID inválido" });
  }

  // Valida a descrição, se ela foi enviada
  if (
    descricao !== undefined &&
    (typeof descricao !== "string" || descricao.trim() === "")
  ) {
    return res.status(400).json({ erro: "Descrição inválida" });
  }

  // Valida o status concluida, se ele foi enviado
  if (concluida !== undefined && typeof concluida !== "boolean") {
    return res.status(400).json({ erro: "concluida deve ser boolean" });
  }

  // Valida a noite, se enviada
  if (noite !== undefined && (typeof noite !== "number" || noite < 1)) {
    return res.status(400).json({ erro: "Noite deve ser um número maior que 0" });
  }

  // Tenta atualizar a tarefa
  const tarefaAtualizada = atualizarTarefa(idNumero, descricao, concluida, noite);

  // Se não encontrar a tarefa, retorna erro 404
  if (!tarefaAtualizada) {
    return res.status(404).json({ erro: "Tarefa não encontrada" });
  }

  // Se atualizar com sucesso, retorna a tarefa atualizada
  res.json({
    mensagem: "Tarefa atualizada com sucesso!",
    tarefa: tarefaAtualizada
  });
});

/**
 * DELETE /tarefas/:id
 * Remove uma tarefa pelo id
 */
app.delete("/tarefas/:id", (req, res) => {
  // Converte o id da URL para número
  const idNumero = Number(req.params.id);

  // Valida o id
  if (Number.isNaN(idNumero)) {
    return res.status(400).json({ erro: "ID inválido" });
  }

  // Tenta excluir a tarefa
  const tarefaRemovida = excluirTarefa(idNumero);

  // Se não encontrar, retorna erro 404
  if (!tarefaRemovida) {
    return res.status(404).json({ erro: "Tarefa não encontrada" });
  }

  // Retorna a tarefa que foi removida
  res.json({
    mensagem: "Tarefa excluída com sucesso!",
    tarefa: tarefaRemovida
  });
});

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================

// Faz o servidor começar a escutar a porta definida
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
