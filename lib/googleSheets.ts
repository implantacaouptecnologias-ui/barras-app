/**
 * Integração com Google Sheets via Service Account.
 * Todas as operações são realizadas no backend — credenciais nunca expostas ao frontend.
 */

import { google, sheets_v4 } from 'googleapis';

const HEADERS = [
  'codigo_barras',
  'nome_item',
  'valor_venda',
  'data_hora',
  'slug_cliente',
  'origem_nome',
  'tipo_unidade',
  'ncm',
];

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

async function ensureSheetReady(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string
): Promise<void> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:Z1`,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error?.code === 400 || error?.code === 404) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    } else {
      throw err;
    }
  }
}

export async function barcodeExists(
  spreadsheetId: string,
  barcode: string,
  tabName: string
): Promise<boolean> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, spreadsheetId, tabName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:A`,
  });

  const values = res.data.values ?? [];
  const codes = values.slice(1).map((row) => String(row[0] ?? '').trim());
  return codes.includes(barcode.trim());
}

export interface SaveRecordParams {
  spreadsheetId: string;
  tabName: string;
  barcode: string;
  itemName: string;
  saleValue: string;
  clientSlug: string;
  nameSource: 'cosmos' | 'manual';
  unitType?: 'kg' | 'un';
  ncm?: string;
}

export async function saveRecord(params: SaveRecordParams): Promise<void> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, params.spreadsheetId, params.tabName);

  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const unitLabel = params.unitType === 'kg' ? 'Kg' : params.unitType === 'un' ? 'Un' : '';

  const row = [
    params.barcode.trim(),
    params.itemName.trim(),
    params.saleValue,
    now,
    params.clientSlug,
    params.nameSource,
    unitLabel,
    params.ncm || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: params.spreadsheetId,
    range: `${params.tabName}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

export async function getRecentRecords(
  spreadsheetId: string,
  limit = 10,
  tabName: string
): Promise<Record<string, string>[]> {
  const sheets = getSheetsClient();
  await ensureSheetReady(sheets, spreadsheetId, tabName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:F`,
  });

  const rows = res.data.values ?? [];
  if (rows.length <= 1) return [];

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
