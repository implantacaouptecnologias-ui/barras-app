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
8. [Deploy em VPS / Render](#deploy-em-vps--render)
9. [Variáveis de Ambiente](#variáveis-de-ambiente)
10. [Fluxo de Uso](#fluxo-de-uso)

---

## Visão Geral

- **URL por cliente:** `https://barras.tecnologiasup.com.br/clienteX`
- **Leitura de câmera** no navegador mobile (câmera traseira por padrão)
- **Consulta automática** na API COSMOS ao ler ou digitar o código
- **Validação de duplicidade** no Google Sheets antes de salvar
- **Multi-tenant simples** via slug na URL → planilha do cliente

---

## Estrutura do Projeto

```
barras-app/
├── pages/
│   ├── [slug]/
│   │   └── index.tsx          # Página principal por cliente
│   ├── api/
│   │   ├── product/
│   │   │   └── lookup.ts      # GET /api/product/lookup — consulta COSMOS
│   │   └── barcode/
│   │       ├── save.ts        # POST /api/barcode/save — salva no Sheets
│   │       └── recent.ts      # GET /api/barcode/recent — histórico
│   ├── 404.tsx                # Página de cliente não encontrado
│   ├── _app.tsx
│   └── _document.tsx
├── components/
│   ├── BarcodeScanner.tsx     # Leitura por câmera (html5-qrcode)
│   └── RecentRecords.tsx      # Lista de últimos cadastros
├── lib/
│   ├── clients.ts             # Mapeamento slug → planilha
│   ├── cosmos.ts              # Integração API COSMOS
│   ├── googleSheets.ts        # Leitura/escrita no Google Sheets
│   ├── rateLimit.ts           # Rate limiting em memória
│   └── validators.ts          # Schemas Zod compartilhados
├── styles/
│   └── globals.css
├── public/
│   └── manifest.json          # PWA manifest
├── .env.example
├── next.config.js
├── tsconfig.json
└── package.json
```

---

## Configuração Local

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/barras-app.git
cd barras-app

# 2. Instale as dependências
npm install

# 3. Crie o arquivo de variáveis de ambiente
cp .env.example .env.local

# 4. Preencha as variáveis (veja seções abaixo)
nano .env.local

# 5. Inicie o servidor de desenvolvimento
npm run dev

# Acesse: http://localhost:3000/clienteX
```

---

## Configurar Google Sheets

### 1. Criar um projeto no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto (ex: `barras-app`)
3. Ative a **Google Sheets API**:
   - Menu → APIs e Serviços → Biblioteca
   - Busque "Google Sheets API" e ative

### 2. Criar uma Service Account

1. Menu → APIs e Serviços → Credenciais
2. Clique em "Criar credenciais" → "Conta de serviço"
3. Dê um nome (ex: `barras-sheets-writer`)
4. Papel: **Editor** (ou crie um papel personalizado com acesso ao Sheets)
5. Clique em "Concluído"

### 3. Baixar a chave JSON

1. Na lista de contas de serviço, clique na conta criada
2. Aba "Chaves" → "Adicionar chave" → "Criar nova chave" → JSON
3. Salve o arquivo JSON baixado

### 4. Configurar a variável de ambiente

Cole o conteúdo do JSON na variável `GOOGLE_SERVICE_ACCOUNT_JSON` no `.env.local`:

```bash
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"barras-app","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvA...\n-----END PRIVATE KEY-----\n","client_email":"barras-sheets-writer@barras-app.iam.gserviceaccount.com","client_id":"1234567890","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}'
```

> **Importante:** O JSON inteiro deve estar em uma linha, entre aspas simples.

### 5. Criar e compartilhar a planilha mestra

Para o modo auto-provisionamento:

1. Crie **uma única planilha mestra** no Google Sheets (ex: `BarrasApp — Registry`)
2. Copie o ID da URL
3. Compartilhe com o e-mail da Service Account com permissão de **Editor**
4. Configure `REGISTRY_SPREADSHEET_ID` com esse ID

A aba `Clientes` e os cabeçalhos serão criados automaticamente.

Para que a Service Account possa criar planilhas novas no Drive, ela precisa de acesso à pasta destino:

- **Sem `DRIVE_FOLDER_ID`:** as planilhas são criadas na raiz do Drive da Service Account (funciona automaticamente, mas fica no Drive dela, não no seu)
- **Com `DRIVE_FOLDER_ID`:** crie uma pasta no seu Google Drive, compartilhe com a Service Account (Editor), copie o ID da pasta da URL e configure `DRIVE_FOLDER_ID`

Para encontrar o ID da pasta: abra a pasta no Drive, o ID é o trecho após `/folders/` na URL.

### Estrutura da planilha

| codigo_barras | nome_item | valor_venda | data_hora | slug_cliente | origem_nome |
|---|---|---|---|---|---|
| 7891234567890 | Arroz Branco 5kg | 25,90 | 20/04/2026 14:35:22 | clienteX | cosmos |
| 7890000000001 | Produto Manual | 12,50 | 20/04/2026 14:40:00 | clienteX | manual |

---

## Configurar API COSMOS

A API já está pré-configurada no código com o token fornecido:

```bash
COSMOS_API_URL=https://api.cosmos.bluesoft.com.br
COSMOS_TOKEN=MIQWO7f3C8Y2feLI185fBg
```

O endpoint utilizado é: `GET /gtins/{codigo}`

Se precisar trocar o token, basta atualizar `COSMOS_TOKEN` no `.env.local`.

---

## Adicionar Clientes

### Modo automático (recomendado) — Auto-provisionamento

Com `REGISTRY_SPREADSHEET_ID` configurado, **qualquer URL válida cria automaticamente uma planilha**.

Exemplo: ao acessar `https://barras.tecnologiasup.com.br/farmacia-central`, o sistema:
1. Verifica se `farmacia-central` já tem planilha na planilha mestra
2. Se não tiver, cria uma nova planilha no Google Drive chamada `BarrasApp — farmacia-central`
3. Registra na planilha mestra (slug, ID, URL, data de criação)
4. Funciona normalmente a partir daí

**Slugs válidos:** letras, números, hífens e underscores. Entre 2 e 60 caracteres.
Exemplos: `clienteX`, `farmacia-centro`, `mercado_sul`, `loja01`

A planilha mestra fica assim:

| slug | spreadsheet_id | spreadsheet_url | criado_em |
|---|---|---|---|
| clienteX | 1Bxi... | https://docs.google.com/... | 20/04/2026 14:30 |
| farmacia-central | 2abc... | https://docs.google.com/... | 20/04/2026 15:00 |

#### Configuração

```bash
# 1. Crie uma planilha mestra manualmente no Google Sheets
# 2. Compartilhe com a Service Account (Editor)
# 3. Copie o ID e configure:
REGISTRY_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

# Opcional: pasta no Drive onde as planilhas dos clientes serão criadas
DRIVE_FOLDER_ID=1A2B3C4D5E6F7G8H9I0J
```

> **Importante:** A Service Account precisa ter permissão na pasta do Drive (ou na raiz) para criar arquivos. Veja como na seção "Configurar Google Sheets".

### Modo manual (legado / desenvolvimento)

Sem `REGISTRY_SPREADSHEET_ID`, use `CLIENT_SHEETS_MAP`:

```bash
CLIENT_SHEETS_MAP='{"clienteX":"id1","clienteY":"id2"}'
```

---

## Deploy na Vercel

A Vercel é a opção mais simples para Next.js.

### 1. Faça push do projeto para o GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/implantacaouptecnologias-ui/barras-app.git
git push -u origin main
```

### 2. Importe na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. "Add New Project" → importe o repositório
3. Framework: **Next.js** (detectado automaticamente)
4. Configure as **Environment Variables** (veja seção abaixo)
5. Clique em "Deploy"

### 3. Configurar domínio personalizado

1. Na dashboard da Vercel, vá em "Settings" → "Domains"
2. Adicione `barras.tecnologiasup.com.br`
3. Configure o DNS conforme instruções da Vercel:
   - Tipo A: `76.76.21.21`
   - ou CNAME: `cname.vercel-dns.com`

### 4. Variáveis de ambiente na Vercel

No painel do projeto → Settings → Environment Variables, adicione cada variável:

| Variável | Valor |
|---|---|
| `COSMOS_API_URL` | `https://api.cosmos.bluesoft.com.br` |
| `COSMOS_TOKEN` | `MIQWO7f3C8Y2feLI185fBg` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `{...json completo...}` |
| `CLIENT_SHEETS_MAP` | `{"clienteX":"id1","clienteY":"id2"}` |
| `SHEET_TAB_NAME` | `Cadastros` |

> **Atenção:** Cole o JSON da Service Account diretamente no campo de valor, sem aspas externas na Vercel.

---

## Deploy em VPS / Render

### VPS (Ubuntu/Debian)

```bash
# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonar e instalar
git clone https://github.com/seu-usuario/barras-app.git
cd barras-app
npm install

# Criar .env.local com as variáveis
cp .env.example .env.local
nano .env.local

# Build de produção
npm run build

# Iniciar com PM2 (gerenciador de processos)
npm install -g pm2
pm2 start npm --name "barras-app" -- start
pm2 save
pm2 startup

# Configurar Nginx como reverse proxy
sudo apt install nginx
```

**Configuração Nginx** (`/etc/nginx/sites-available/barras`):

```nginx
server {
    listen 80;
    server_name barras.tecnologiasup.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/barras /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL com Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d barras.tecnologiasup.com.br
```

### Render.com

1. Crie um novo "Web Service" conectando seu repositório
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Adicione as variáveis de ambiente no painel

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `COSMOS_API_URL` | Sim | URL base da API COSMOS |
| `COSMOS_TOKEN` | Sim | Token de autenticação COSMOS |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sim | JSON completo da Service Account |
| `REGISTRY_SPREADSHEET_ID` | Recomendado | ID da planilha mestra — habilita auto-provisionamento |
| `DRIVE_FOLDER_ID` | Não | Pasta do Drive onde criar planilhas dos clientes |
| `CLIENT_SHEETS_MAP` | Legado | JSON com mapeamento manual (sem registry) |
| `SHEET_TAB_NAME` | Não | Nome da aba de dados (padrão: `Cadastros`) |

---

## Fluxo de Uso

```
Operador abre /{slug}
       ↓
Lê código com câmera ou digita manualmente
       ↓
Sistema consulta API COSMOS
       ↓
┌──────────────────┬────────────────────┐
│ Produto encontrado│ Produto não encontrado│
│ Nome preenchido   │ Campo nome manual  │
│ automaticamente   │                    │
└──────────────────┴────────────────────┘
       ↓
Operador informa valor de venda
       ↓
Clica em "Salvar produto"
       ↓
Backend valida duplicidade no Sheets
       ↓
┌──────────────────┬────────────────────┐
│ Código já existe │ Código novo        │
│ Mensagem de erro │ Salva na planilha  │
│                  │ Tela limpa ✓       │
└──────────────────┴────────────────────┘
```

---

## Segurança

- Credenciais do Google e COSMOS **nunca** expostas no frontend
- Rate limiting em memória: 30 req/min por IP
- Validação de entrada no backend (Zod)
- CORS configurado
- Headers de segurança via `next.config.js`

---

## Suporte a PWA

Para instalar como app no celular:
1. Acesse a URL no Chrome/Safari mobile
2. Toque no menu → "Adicionar à tela inicial"

O app funcionará em tela cheia sem barra de endereço.
