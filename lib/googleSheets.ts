/**
 * Integração com Google Sheets via Service Account.
 * Todas as operações são realizadas no backend — credenciais nunca expostas ao frontend.
 */

import { google, sheets_v4 } from 'googleapis';

const SHEET_TAB = process.env.SHEET_TAB_NAME || 'Cadastros';

// Cabeçalhos das colunas na planilha
const HEADERS = [
  'codigo_barras',
  'nome_item',
  'valor_venda',
  'data_hora',
  'slug_cliente',
  'origem_nome', // 'cosmos' | 'manual'
];

/**
 * Retorna um cliente autenticado do Google Sheets.
 */
function getSheetsClient(): sheets_v4.Sheets {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.');

  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Garante que a aba existe e tem cabeçalhos. Cria se necessário.
 */
async function ensureSheetReady(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<void> {
  try {
    // Tenta ler cabeçalhos existentes
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TAB}!A1:Z1`,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      // Aba existe mas está vazia — inserir cabeçalhos
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  } catch (err: unknown) {
    // Aba não existe — criar
    const error = err as { code?: number };
    if (error?.code === 400 || error?.code === 404) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: SHEET_TAB },
              },
            },
          ],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    } else {
      throw err;
    }
  }
}

/**
 * Verifica se um código de barras já existe na planilha.
 * Retorna true se duplicado.
 */
export async function barcodeExists(
  spreadsheetId: string,
  barcode: string
): Promise<boolean> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A:A`, // coluna de códigos de barras
  });

  const values = res.data.values ?? [];
  // Pula linha de cabeçalho (índice 0)
  const codes = values.slice(1).map((row) => String(row[0] ?? '').trim());
  return codes.includes(barcode.trim());
}

/**
 * Salva um novo registro na planilha.
 */
export interface SaveRecordParams {
  spreadsheetId: string;
  barcode: string;
  itemName: string;
  saleValue: string; // valor já formatado como string (ex: "29.90")
  clientSlug: string;
  nameSource: 'cosmos' | 'manual';
}

export async function saveRecord(params: SaveRecordParams): Promise<void> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, params.spreadsheetId);

  // Formato de data/hora em horário de Brasília
  const now = new Date();
  const brDate = now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const row = [
    params.barcode.trim(),
    params.itemName.trim(),
    params.saleValue,
    brDate,
    params.clientSlug,
    params.nameSource,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: params.spreadsheetId,
    range: `${SHEET_TAB}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Retorna os últimos N registros da planilha (ordem reversa).
 */
export async function getRecentRecords(
  spreadsheetId: string,
  limit = 10
): Promise<Record<string, string>[]> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A:F`,
  });

  const rows = res.data.values ?? [];
  if (rows.length <= 1) return []; // só cabeçalho ou vazio

  const headers = rows[0];
  const data = rows.slice(1).reverse().slice(0, limit);

  return data.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}
