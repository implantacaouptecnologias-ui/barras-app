/**
 * GET /api/product/lookup?barcode=XXXXX&slug=clienteX
 *
 * Consulta o produto na API COSMOS e retorna os dados.
 * Também valida se o cliente (slug) existe.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { lookupProduct } from '@/lib/cosmos';
import { isValidSlug } from '@/lib/clients';
import { isRateLimited } from '@/lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Rate limit por IP
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
  }

  const { barcode, slug } = req.query;

  if (!barcode || typeof barcode !== 'string') {
    return res.status(400).json({ error: 'Parâmetro barcode obrigatório' });
  }

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Parâmetro slug obrigatório' });
  }

  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  try {
    const product = await lookupProduct(barcode);
    return res.status(200).json(product);
  } catch (err) {
    console.error('[api/product/lookup]', err);
    return res.status(500).json({ error: 'Erro interno ao consultar produto' });
  }
}
