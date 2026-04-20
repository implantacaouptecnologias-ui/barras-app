/**
 * Registry de clientes auto-provisionado via Google Sheets.
 *
 * Como funciona:
 * - Uma planilha "mestra" (REGISTRY_SPREADSHEET_ID) registra todos os clientes e suas planilhas.
 * - Quando um slug novo é acessado, o sistema:
 *   1. Cria uma nova planilha no Google Drive para aquele cliente
 *   2. Registra o slug e o spreadsheetId na planilha mestra
 *   3. A partir daí, acessa normalmente
 *
 * Variável necessária:
 *   REGISTRY_SPREADSHEET_ID — ID da planilha mestra (criada manualmente uma vez)
 *
 * Cache em memória evita chamadas repetidas à API para slugs já conhecidos.
 */

import { google, sheets_v4, drive_v3 } from 'googleapis';

const REGISTRY_TAB = 'Clientes';
const REGISTRY_HEADERS = ['slug', 'spreadsheet_id', 'spreadsheet_url', 'criado_em'];

// Cache em memória: slug -> spreadsheetId
// Evita bater na planilha mestra a cada request
const cache = new Map<string, string>();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDriveClient(): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: getAuth() });
}

/**
 * Garante que a planilha mestra existe e tem cabeçalhos.
 */
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
    // Aba não existe — cria
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

/**
 * Carrega todos os clientes da planilha mestra para o cache.
 */
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

  // Pula header (linha 0)
  for (const row of rows.slice(1)) {
    const slug = String(row[0] ?? '').trim();
    const id = String(row[1] ?? '').trim();
    if (slug && id) cache.set(slug, id);
  }

  cacheLoadedAt = Date.now();
}

/**
 * Retorna o spreadsheetId para um slug, consultando o cache ou a planilha mestra.
 * Retorna null se não encontrado.
 */
export async function getSpreadsheetIdForSlug(slug: string): Promise<string | null> {
  // Verifica cache (com TTL)
  const now = Date.now();
  if (cache.has(slug) && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cache.get(slug)!;
  }

  // Recarrega cache da planilha mestra
  await loadRegistryIntoCache();

  return cache.get(slug) ?? null;
}

/**
 * Cria uma nova planilha para o cliente e registra na planilha mestra.
 * Retorna o spreadsheetId da nova planilha.
 */
export async function provisionClientSpreadsheet(slug: string): Promise<string> {
  const drive = getDriveClient();
  const sheets = getSheetsClient();

  const registryId = process.env.REGISTRY_SPREADSHEET_ID;
  if (!registryId) throw new Error('REGISTRY_SPREADSHEET_ID não configurado.');

  // Obtém o folderId onde criar (opcional)
  const folderId = process.env.DRIVE_FOLDER_ID ?? undefined;

  // 1. Cria a planilha no Drive
  const createRes = await drive.files.create({
    requestBody: {
      name: `BarrasApp — ${slug}`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      ...(folderId ? { parents: [folderId] } : {}),
    },
    fields: 'id, webViewLink',
  });

  const newSpreadsheetId = createRes.data.id!;
  const newSpreadsheetUrl = createRes.data.webViewLink ?? '';

  // 2. Cria a aba "Cadastros" com cabeçalhos na nova planilha
  const SHEET_TAB = process.env.SHEET_TAB_NAME || 'Cadastros';
  const HEADERS = [
    'codigo_barras',
    'nome_item',
    'valor_venda',
    'data_hora',
    'slug_cliente',
    'origem_nome',
  ];

  // Renomeia a aba padrão "Plan1" para o nome configurado
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: newSpreadsheetId });
  const defaultSheetId = sheetMeta.data.sheets?.[0]?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: newSpreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: SHEET_TAB },
            fields: 'title',
          },
        },
      ],
    },
  });

  // Insere cabeçalhos
  await sheets.spreadsheets.values.update({
    spreadsheetId: newSpreadsheetId,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
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
    requestBody: {
      values: [[slug, newSpreadsheetId, newSpreadsheetUrl, now]],
    },
  });

  // 4. Atualiza cache
  cache.set(slug, newSpreadsheetId);

  console.log(`[registry] Nova planilha criada para "${slug}": ${newSpreadsheetId}`);
  return newSpreadsheetId;
}

/**
 * Retorna o spreadsheetId para um slug.
 * Se o slug não existir, cria automaticamente a planilha e registra.
 * Esta é a função principal usada pelas rotas da API.
 */
export async function resolveOrCreateClient(slug: string): Promise<string> {
  // Tenta encontrar no registry
  const existing = await getSpreadsheetIdForSlug(slug);
  if (existing) return existing;

  // Não existe — provisiona automaticamente
  return provisionClientSpreadsheet(slug);
}

/**
 * Retorna todos os clientes registrados.
 * Útil para uma eventual página de administração.
 */
export async function listAllClients(): Promise<
  { slug: string; spreadsheetId: string; url: string; createdAt: string }[]
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
    url: String(row[2] ?? ''),
    createdAt: String(row[3] ?? ''),
  }));
}
