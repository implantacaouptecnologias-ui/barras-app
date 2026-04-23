/**
 * Registry de clientes — planilha mestra no Google Sheets.
 *
 * Abordagem: uma única planilha de dados com uma aba (tab) por cliente.
 * Nenhum arquivo novo é criado no Drive, eliminando problemas de quota.
 *
 * Variáveis necessárias:
 *   REGISTRY_SPREADSHEET_ID — planilha mestra (índice de clientes)
 *   DATA_SPREADSHEET_ID     — planilha de dados (abas por cliente)
 *                             Se omitida, usa a mesma que REGISTRY_SPREADSHEET_ID.
 */

import { google, sheets_v4 } from 'googleapis';

const REGISTRY_TAB = 'Clientes';
const REGISTRY_HEADERS = ['slug', 'spreadsheet_id', 'tab_name', 'criado_em'];
const DATA_HEADERS = ['codigo_barras', 'nome_item', 'valor_venda', 'data_hora', 'slug_cliente', 'origem_nome', 'tipo_unidade'];

export interface ClientSheet {
  spreadsheetId: string;
  tabName: string;
}

const cache = new Map<string, ClientSheet>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDataSpreadsheetId(): string {
  const id = process.env.DATA_SPREADSHEET_ID ?? process.env.REGISTRY_SPREADSHEET_ID;
  if (!id) throw new Error('DATA_SPREADSHEET_ID ou REGISTRY_SPREADSHEET_ID não configurado.');
  return id;
}

async function ensureRegistryReady(sheets: sheets_v4.Sheets): Promise<void> {
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID não configurado.');

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: registryId,
      range: `${REGISTRY_TAB}!A1:D1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: registryId,
        range: `${REGISTRY_TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [REGISTRY_HEADERS] },
      });
    }
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error?.code === 400 || error?.code === 404) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: registryId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: REGISTRY_TAB } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: registryId,
        range: `${REGISTRY_TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [REGISTRY_HEADERS] },
      });
    } else {
      throw err;
    }
  }
}

async function loadRegistryIntoCache(): Promise<void> {
  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) return;

  const sheets = getSheetsClient();
  await ensureRegistryReady(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `${REGISTRY_TAB}!A:D`,
  });

  const rows = res.data.values ?? [];
  cache.clear();

  for (const row of rows.slice(1)) {
    const slug = String(row[0] ?? '').trim();
    const spreadsheetId = String(row[1] ?? '').trim();
    const tabName = String(row[2] ?? '').trim();
    if (slug && spreadsheetId && tabName) {
      cache.set(slug, { spreadsheetId, tabName });
    }
  }

  cacheLoadedAt = Date.now();
}

export async function getSpreadsheetIdForSlug(slug: string): Promise<ClientSheet | null> {
  const now = Date.now();
  if (cache.has(slug) && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cache.get(slug)!;
  }

  await loadRegistryIntoCache();
  return cache.get(slug) ?? null;
}

export async function provisionClientSpreadsheet(slug: string): Promise<ClientSheet> {
  const sheets = getSheetsClient();
  const dataSpreadsheetId = getDataSpreadsheetId();
  const registryId = process.env.REGISTRY_SPREADSHEET_ID!;

  // Slug já é alfanumérico com hifens/underscores — válido como nome de aba
  const tabName = slug;

  // 1. Cria a aba do cliente na planilha de dados
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: dataSpreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });

  // 2. Insere cabeçalhos na nova aba
  await sheets.spreadsheets.values.update({
    spreadsheetId: dataSpreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [DATA_HEADERS] },
  });

  // 3. Registra na planilha mestra
  await ensureRegistryReady(sheets);

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: registryId,
    range: `${REGISTRY_TAB}!A:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[slug, dataSpreadsheetId, tabName, now]] },
  });

  const clientSheet: ClientSheet = { spreadsheetId: dataSpreadsheetId, tabName };
  cache.set(slug, clientSheet);

  console.log(`[registry] Nova aba criada para "${slug}" em ${dataSpreadsheetId}`);
  return clientSheet;
}

export async function resolveOrCreateClient(slug: string): Promise<ClientSheet> {
  const existing = await getSpreadsheetIdForSlug(slug);
  if (existing) return existing;
  return provisionClientSpreadsheet(slug);
}

export async function listAllClients(): Promise<
  { slug: string; spreadsheetId: string; tabName: string; createdAt: string }[]
> {
  await loadRegistryIntoCache();

  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) return [];

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: registryId,
    range: `${REGISTRY_TAB}!A:D`,
  });

  const rows = res.data.values ?? [];
  return rows.slice(1).map((row) => ({
    slug: String(row[0] ?? ''),
    spreadsheetId: String(row[1] ?? ''),
    tabName: String(row[2] ?? ''),
    createdAt: String(row[3] ?? ''),
  }));
}
