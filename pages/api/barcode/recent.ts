/**
 * GET /api/barcode/recent?slug=clienteX
 *
 * Retorna os últimos registros cadastrados para o cliente.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidSlug } from '@/lib/clients';
import { getRecentRecords } from '@/lib/googleSheets';
import { isRateLimited } from '@/lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas requisições.' });
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug obrigatório' });
  }

  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const PAGE_SIZE = 25;

  try {
    const { getSpreadsheetIdForSlug } = await import('@/lib/registry');
    const client = await getSpreadsheetIdForSlug(slug);
    if (!client) {
      return res.status(200).json({ records: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }

    const { records, total } = await getRecentRecords(client.spreadsheetId, client.tabName, page, PAGE_SIZE);
    return res.status(200).json({ records, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error('[api/barcode/recent]', err);
    return res.status(500).json({ error: 'Erro ao buscar registros' });
  }
}
