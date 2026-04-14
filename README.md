# 🏆 Copa Unasp 2026 - Portal Oficial

Este é o sistema oficial da Copa Unasp, desenvolvido com React, TypeScript e Vite. O projeto agora conta com suporte **PWA (Offline)** e está pronto para deploy no **Vercel**.

---

## 📱 Suporte Offline (PWA)
O aplicativo foi configurado como um Progressive Web App. Isso significa que:
- **Funciona sem Internet**: Os arquivos base (HTML, CSS, JS e Imagens) são cacheados automaticamente.
- **Instalável**: Você pode adicionar o app à tela inicial do seu celular (Android e iOS).
- **Atualização Automática**: O sistema verifica por novas versões toda vez que é aberto.

---

## 🚀 Guia de Deploy (GitHub + Vercel)

Siga estes passos para colocar o sistema no ar:

### 1. Subir para o GitHub (Manualmente)
1. Crie um novo repositório no seu GitHub chamado `copaunasp`.
2. No seu computador, abra a pasta do projeto no terminal e rode:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: PWA and Admin Refinement"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/copaunasp.git
   git push -u origin main
   ```
   *(Substitua `SEU_USUARIO` pelo seu nome no GitHub)*.

### 2. Conectar ao Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com seu GitHub.
2. Clique em **"Add New"** -> **"Project"**.
3. Importe o repositório `copaunasp`.
4. **Configurações Importantes (Environment Variables):**
   No campo "Environment Variables", adicione as seguintes chaves (copie do seu arquivo `.env` local):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` *(chave pública do Web Push; deve bater com a chave privada usada na função que envia o push)*
5. Clique em **Deploy**.

---

## 🛠️ Tecnologias Utilizadas
- **Frontend**: React + Vite + TypeScript
- **Backend/DB**: Supabase (PostgreSQL + Realtime)
- **Styling**: Vanilla CSS (Premium Design System)
- **Icons**: Lucide React
- **PWA**: vite-plugin-pwa (Workbox)

---

## 🛡️ Segurança
O arquivo `.env` foi adicionado ao `.gitignore` para proteger suas chaves do Supabase. Use o arquivo `.env.example` como referência para configurar novos ambientes.
