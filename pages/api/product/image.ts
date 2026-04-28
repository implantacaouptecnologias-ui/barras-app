/**
 * GET /api/product/image?url=https://...
 *
 * Proxy server-side para imagens do COSMOS — evita bloqueios de CORS no browser.
 * Só aceita URLs do domínio oficial do COSMOS.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const isAllowedHost = (hostname: string) =>
  hostname === 'bluesoft.com.br' || hostname.endsWith('.bluesoft.com.br');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).end();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).end();
  }

  if (!isAllowedHost(parsed.hostname)) {
    console.warn('[image-proxy] hostname bloqueado:', parsed.hostname);
    return res.status(403).end();
  }

  try {
    const imageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Cosmos-API-Request',
        'X-Cosmos-Token': process.env.COSMOS_TOKEN || '',
      },
    });

    if (!imageRes.ok) return res.status(404).end();

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return res.status(400).end();

    const buffer = await imageRes.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).end();
  }
}
