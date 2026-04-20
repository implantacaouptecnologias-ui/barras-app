/**
 * Resolução de clientes — combina duas estratégias:
 *
 * 1. REGISTRY (principal): planilha mestra no Google Sheets com todos os clientes.
 *    Slugs novos são provisionados automaticamente (nova planilha criada no Drive).
 *
 * 2. ENV FALLBACK (opcional): CLIENT_SHEETS_MAP no .env para clientes estáticos.
 *    Útil em desenvolvimento ou para clientes pré-cadastrados.
 */

import { resolveOrCreateClient } from './registry';

export interface ClientConfig {
  spreadsheetId: string;
}

/**
 * Lê o mapa estático de clientes da variável de ambiente CLIENT_SHEETS_MAP.
 */
function getStaticClientConfig(slug: string): ClientConfig | null {
  const raw = process.env.CLIENT_SHEETS_MAP;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string | ClientConfig>;
    const entry = map[slug];
    if (!entry) return null;
    if (typeof entry === 'string') return { spreadsheetId: entry };
    return entry;
  } catch {
    return null;
  }
}

/**
 * Resolve o spreadsheetId para um slug.
 * - Com REGISTRY_SPREADSHEET_ID: cria planilha automaticamente se slug for novo.
 * - Sem REGISTRY_SPREADSHEET_ID: usa CLIENT_SHEETS_MAP do .env.
 */
export async function resolveClientSpreadsheetId(slug: string): Promise<string | null> {
  if (process.env.REGISTRY_SPREADSHEET_ID) {
    try {
      return await resolveOrCreateClient(slug);
    } catch (err) {
      console.error(`[clients] Erro ao resolver/criar cliente "${slug}":`, err);
      return null;
    }
  }
  return getStaticClientConfig(slug)?.spreadsheetId ?? null;
}

/**
 * Valida se um slug tem formato aceitável.
 * Permite letras, números, hífens e underscores. Mínimo 2, máximo 60 chars.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{2,60}$/.test(slug);
}

/**
 * Verifica se um slug deve ser aceito pela página.
 * No modo registry: aceita qualquer slug válido (será criado na primeira chamada à API).
 * No modo env: verifica CLIENT_SHEETS_MAP.
 */
export function slugIsAcceptable(slug: string): boolean {
  if (!isValidSlug(slug)) return false;
  if (process.env.REGISTRY_SPREADSHEET_ID) return true;
  return getStaticClientConfig(slug) !== null;
}
