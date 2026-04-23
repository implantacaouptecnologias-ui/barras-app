import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveClientSpreadsheetId, isValidSlug } from '@/lib/clients';
import { barcodeExists } from '@/lib/googleSheets';
import { isRateLimited } from '@/lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
  }

  const { slug, barcode } = req.query;
  if (!slug || typeof slug !== 'string' || !isValidSlug(slug)) {
    return res.status(400).json({ error: 'Slug inválido' });
  }
  if (!barcode || typeof barcode !== 'string' || !/^\d+$/.test(barcode.trim())) {
    return res.status(400).json({ error: 'Código de barras inválido' });
  }

  try {
    const client = await resolveClientSpreadsheetId(slug);
    if (!client) return res.status(200).json({ exists: false });

    const exists = await barcodeExists(client.spreadsheetId, barcode.trim(), client.tabName);
    return res.status(200).json({ exists });
  } catch (err) {
    console.error('[api/barcode/check]', err);
    return res.status(500).json({ error: 'Erro ao verificar código' });
  }
}
