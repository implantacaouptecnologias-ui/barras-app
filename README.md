# BarrasApp — Cadastro de Produtos por Código de Barras

Sistema multi-tenant para cadastro de produtos via código de barras, com leitura por câmera, consulta automática na API COSMOS e persistência no Google Sheets.

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Estrutura do Projeto](#estrutura-do-projeto)
3. [Configuração Local](#configuração-local)
4. [Configurar Google Sheets](#configurar-google-sheets)
5. [Configurar API COSMOS](#configurar-api-cosmos)
6. [Adicionar Clientes](#adicionar-clientes)
7. [Deploy na Vercel](#deploy-na-vercel)
8. [Variáveis de Ambiente](#variáveis-de-ambiente)
9. [Fluxo de Uso](#fluxo-de-uso)
10. [Segurança](#segurança)

---

## Visão Geral

- **URL por cliente:** `https://seudominio.com.br/{slug}`
- **Wizard em etapas:** Código → Nome → Preço
- **Leitura por câmera** com timeout de 10 segundos (câmera traseira por padrão)
- **Consulta automática** na API COSMOS ao avançar do código
- **NCM gravado automaticamente** quando produto é encontrado no COSMOS
- **Validação de duplicidade** antes de avançar para o nome — erro exibido ainda na etapa do código
- **Tipo de produto** (Kg / Un) obrigatório para códigos curtos (≤ 4 dígitos)
- **Multi-tenant** via slug na URL → aba exclusiva por cliente na planilha de dados
- **Favicon e ícone PWA** com a logo da empresa

---

## Estrutura do Projeto

```
barras-app/
├── pages/
│   ├── [slug]/
│   │   └── index.tsx          # Página principal por cliente (wizard)
│   ├── api/
│   │   ├── product/
│   │   │   └── lookup.ts      # GET /api/product/lookup — consulta COSMOS
│   │   └── barcode/
│   │       ├── save.ts        # POST /api/barcode/save — salva no Sheets
│   │       ├── check.ts       # GET /api/barcode/check — verifica duplicidade
│   │       └── recent.ts      # GET /api/barcode/recent — histórico
│   ├── _app.tsx               # Favicon / layout global
│   └── _document.tsx
├── components/
│   ├── BarcodeScanner.tsx     # Leitura por câmera (html5-qrcode, timeout 10s)
│   └── RecentRecords.tsx      # Lista de últimos cadastros
├── lib/
│   ├── clients.ts             # Resolução slug → planilha + validação de slug
│   ├── cosmos.ts              # Integração API COSMOS (nome + NCM)
│   ├── googleSheets.ts        # Leitura/escrita no Google Sheets
│   ├── registry.ts            # Planilha mestra + auto-provisionamento de abas
│   ├── rateLimit.ts           # Rate limiting em memória
│   └── validators.ts          # Schemas Zod compartilhados
├── styles/
│   └── globals.css            # Design system: Inter, cyan #00BCD4, lime #A4D65E
├── public/
│   └── logo.webp              # Logo da empresa (favicon + header)
├── .env.example
├── next.config.js             # reactStrictMode: false (evita dupla inicialização da câmera)
├── vercel.json
└── package.json
```

---

## Configuração Local

### Pré-requisitos

- Node.js 18+
- npm

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/implantacaouptecnologias-ui/barras-app.git
cd barras-app

# 2. Instale as dependências
npm install

# 3. Crie o arquivo de variáveis de ambiente
cp .env.example .env.local

# 4. Preencha as variáveis (veja seções abaixo)
# edite .env.local com suas credenciais

# 5. Inicie o servidor de desenvolvimento
npm run dev

# Acesse: http://localhost:3000/{slug}
```

> **Câmera no celular em rede local:** o navegador só permite acesso à câmera em HTTPS. Use ngrok para criar um túnel HTTPS: `ngrok http 3000`

---

## Configurar Google Sheets

### 1. Criar um projeto no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto (ex: `barras-app`)
3. Ative a **Google Sheets API**: Menu → APIs e Serviços → Biblioteca → "Google Sheets API"

### 2. Criar uma Service Account

1. Menu → APIs e Serviços → Credenciais
2. "Criar credenciais" → "Conta de serviço"
3. Nome: `barras-sheets-writer` — papel: **Editor**
4. Aba "Chaves" → "Adicionar chave" → JSON → salve o arquivo

### 3. Configurar variável de ambiente

Cole o conteúdo do JSON na variável `GOOGLE_SERVICE_ACCOUNT_JSON` (em uma linha):

```bash
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...@....iam.gserviceaccount.com",...}'
```

### 4. Criar as planilhas e compartilhar

O sistema usa **duas planilhas** (podem ser a mesma):

| Variável | Finalidade |
|---|---|
| `REGISTRY_SPREADSHEET_ID` | Planilha mestra com a aba `Clientes` (índice de clientes) |
| `DATA_SPREADSHEET_ID` | Planilha de dados onde cada cliente tem uma aba própria |

1. Crie as planilhas no Google Sheets
2. Compartilhe ambas com o e-mail da Service Account como **Editor**
3. Copie os IDs da URL e configure as variáveis

A aba `Clientes` e as abas dos clientes são criadas automaticamente na primeira requisição.

### Estrutura das abas de dados

Cada cliente possui uma aba com as colunas:

| codigo_barras | nome_item | valor_venda | data_hora | slug_cliente | origem_nome | tipo_unidade | ncm |
|---|---|---|---|---|---|---|---|
| 7891234567890 | Arroz Branco 5kg | 25,90 | 23/04/2026 14:35:22 | clienteX | cosmos | Un | 10063021 |
| 10 | Presunto Fatiado | 46,00 | 23/04/2026 15:05:19 | clienteX | manual | Kg | |

---

## Configurar API COSMOS

```bash
COSMOS_API_URL=https://api.cosmos.bluesoft.com.br
COSMOS_TOKEN=seu_token_aqui
```

O endpoint utilizado é `GET /gtins/{codigo}`. Quando o produto é encontrado, o sistema captura automaticamente o **nome** e o **código NCM** (`ncm.code`).

---

## Adicionar Clientes

Com `REGISTRY_SPREADSHEET_ID` configurado, **qualquer URL válida provisiona automaticamente uma aba**.

Exemplo: ao acessar `/farmacia-central` pela primeira vez:
1. O sistema verifica que o slug não existe na planilha mestra
2. Cria a aba `farmacia-central` na planilha de dados com os cabeçalhos
3. Registra na planilha mestra (slug, spreadsheet_id, tab_name, criado_em)
4. Funciona normalmente a partir daí

**Slugs válidos:** letras, números, hífens e underscores — entre 2 e 60 caracteres.
Exemplos: `farmacia-centro`, `mercado_sul`, `loja01`

---

## Deploy na Vercel

O projeto está configurado para deploy automático via push no branch `main`.

### 1. Importar na Vercel (primeira vez)

1. Acesse [vercel.com](https://vercel.com) e faça login
2. "Add New Project" → importe o repositório do GitHub
3. Framework: **Next.js** (detectado automaticamente)
4. Configure as **Environment Variables** antes de fazer o deploy
5. Clique em "Deploy"

### 2. Variáveis de ambiente na Vercel

Settings → Environment Variables:

| Variável | Obrigatória | Valor |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sim | JSON completo da Service Account |
| `REGISTRY_SPREADSHEET_ID` | Sim | ID da planilha mestra |
| `DATA_SPREADSHEET_ID` | Sim | ID da planilha de dados |
| `COSMOS_API_URL` | Sim | `https://api.cosmos.bluesoft.com.br` |
| `COSMOS_TOKEN` | Sim | Token de autenticação COSMOS |

> Cole o JSON da Service Account diretamente no campo de valor, sem aspas externas.

### 3. Configurar domínio personalizado

1. Settings → Domains → "Add Domain"
2. Para usar os nameservers do Vercel (recomendado): configure `ns1.vercel-dns.com` e `ns2.vercel-dns.com` no Registro.br e aguarde a propagação
3. Para apontar manualmente:
   - Subdomínio: CNAME → `cname.vercel-dns.com`
   - Domínio raiz: A → `76.76.21.21`

### 4. Atualizar o deploy

Basta fazer `git push origin main` — a Vercel detecta e faz o deploy automaticamente.

Para forçar um redeploy manual: Deployments → três pontos → "Redeploy".

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sim | JSON completo da Service Account Google |
| `REGISTRY_SPREADSHEET_ID` | Sim | ID da planilha mestra (aba `Clientes`) |
| `DATA_SPREADSHEET_ID` | Sim | ID da planilha de dados (abas por cliente) |
| `COSMOS_API_URL` | Sim | URL base da API COSMOS |
| `COSMOS_TOKEN` | Sim | Token de autenticação COSMOS |
| `CLIENT_SHEETS_MAP` | Não | Mapeamento manual legado (sem registry) |

---

## Fluxo de Uso

```
Operador abre /{slug}
       ↓
[Etapa 1] Digita ou escaneia o código de barras
       ↓
Clica em "Continuar" (ou Enter / câmera detecta)
       ↓
Verifica duplicidade na planilha
       ↓
┌─────────────────────┬──────────────────────┐
│ Já cadastrado       │ Código novo          │
│ Erro na etapa 1     │ Consulta COSMOS      │
└─────────────────────┴──────────────────────┘
                              ↓
              ┌───────────────┴──────────────────┐
              │ Encontrado                        │ Não encontrado
              │ Nome + NCM preenchidos            │ [Etapa 2] Nome manual
              │ Avança para preço                 │ (+ Kg/Un se código ≤ 4 dígitos)
              └───────────────────────────────────┘
                              ↓
               [Etapa 3] Informa valor de venda
                              ↓
                    Clica em "Salvar produto"
                              ↓
                   Salvo na aba do cliente ✓
                   Tela volta ao início
```

---

## Segurança

- Credenciais do Google e COSMOS **nunca** expostas no frontend
- Rate limiting em memória: 30 req/min por IP em todos os endpoints
- Validação de slug (`/^[a-zA-Z0-9_-]{2,60}$/`) em todas as rotas de API
- Barcode restrito a dígitos (`/^\d+$/`) no cliente e no servidor (Zod)
- Nome do produto: máximo 60 caracteres, strip de caracteres de controle e null bytes
- Valor de venda: apenas dígitos, vírgula e ponto — rejeitado se zero ou negativo
- Injeção de fórmulas no Sheets prevenida via `valueInputOption: 'RAW'`
- `reactStrictMode: false` para evitar dupla inicialização da câmera
