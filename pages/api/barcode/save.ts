/**
 * POST /api/barcode/save
 *
 * Salva um registro de código de barras na aba do cliente.
 * Valida duplicidade antes de inserir.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveClientSpreadsheetId, isValidSlug } from '@/lib/clients';
import { barcodeExists, saveRecord } from '@/lib/googleSheets';
import { saveProductSchema, parseMonetaryValue, formatValue } from '@/lib/validators';
import { isRateLimited } from '@/lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string' || !isValidSlug(slug)) {
    return res.status(400).json({ error: 'Parâmetro slug inválido' });
  }

  const parsed = saveProductSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return res.status(400).json({ error: firstError.message });
  }

  const { barcode, itemName, saleValue, nameSource, unitType } = parsed.data;

  const numericValue = parseMonetaryValue(saleValue);
  if (isNaN(numericValue) || numericValue <= 0) {
    return res.status(400).json({ error: 'Valor de venda inválido' });
  }

  try {
    const client = await resolveClientSpreadsheetId(slug);
    if (!client) {
      return res.status(500).json({ error: 'Não foi possível criar/encontrar a planilha do cliente.' });
    }

    const { spreadsheetId, tabName } = client;

    const isDuplicate = await barcodeExists(spreadsheetId, barcode, tabName);
    if (isDuplicate) {
      return res.status(409).json({ error: 'Este código de barras já foi cadastrado.' });
    }

    await saveRecord({
      spreadsheetId,
      tabName,
      barcode,
      itemName,
      saleValue: formatValue(numericValue),
      clientSlug: slug,
      nameSource,
      unitType,
    });

    return res.status(200).json({ success: true, message: 'Produto cadastrado com sucesso!' });
  } catch (err) {
    console.error('[api/barcode/save]', err);
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: `Erro ao salvar: ${message}` });
  }
}
