/**
 * Integração com a API COSMOS (Bluesoft) para consulta de produtos por código de barras.
 * Todas as requisições são feitas no backend.
 */

const COSMOS_BASE_URL = process.env.COSMOS_API_URL || 'https://api.cosmos.bluesoft.com.br';
const COSMOS_TOKEN = process.env.COSMOS_TOKEN || '';

export interface CosmosProduct {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  description?: string;
  thumbnail?: string;
}

/**
 * Consulta um produto pelo GTIN/código de barras na API COSMOS.
 */
export async function lookupProduct(barcode: string): Promise<CosmosProduct> {
  const cleanBarcode = barcode.replace(/\s+/g, '').trim();

  if (!COSMOS_TOKEN) {
    console.warn('[cosmos] COSMOS_TOKEN não configurado.');
    return { found: false, barcode: cleanBarcode };
  }

  const url = `${COSMOS_BASE_URL}/gtins/${encodeURIComponent(cleanBarcode)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Cosmos-Token': COSMOS_TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'Cosmos-API-Request',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.status === 404) {
      return { found: false, barcode: cleanBarcode };
    }

    if (res.status === 401 || res.status === 403) {
      console.error('[cosmos] Autenticação falhou. Verifique COSMOS_TOKEN.');
      return { found: false, barcode: cleanBarcode };
    }

    if (res.status === 429) {
      console.warn('[cosmos] Rate limit atingido.');
      return { found: false, barcode: cleanBarcode };
    }

    if (!res.ok) {
      console.error(`[cosmos] Erro HTTP ${res.status}`);
      return { found: false, barcode: cleanBarcode };
    }

    const data = await res.json();

    // A API COSMOS retorna o produto com campo "description" como nome
    const name =
      data?.description ||
      data?.name ||
      data?.title ||
      null;

    if (!name) {
      return { found: false, barcode: cleanBarcode };
    }

    return {
      found: true,
      barcode: cleanBarcode,
      name: String(name).trim(),
      brand: data?.brand?.name || data?.brand || undefined,
      description: data?.description || undefined,
      thumbnail: data?.thumbnail || undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const error = err as Error;
    if (error?.name === 'AbortError') {
      console.error('[cosmos] Timeout ao consultar produto.');
    } else {
      console.error('[cosmos] Erro na consulta:', error?.message);
    }
    return { found: false, barcode: cleanBarcode };
  }
}
