/**
 * Resolução de clientes — combina duas estratégias:
 *
 * 1. REGISTRY (principal): planilha mestra no Google Sheets com todos os clientes.
 *    Slugs novos recebem uma nova aba na planilha de dados automaticamente.
 *
 * 2. ENV FALLBACK (opcional): CLIENT_SHEETS_MAP no .env para clientes estáticos.
 */

import { resolveOrCreateClient, ClientSheet } from './registry';

export type { ClientSheet };

function getStaticClientConfig(slug: string): ClientSheet | null {
  const raw = process.env.CLIENT_SHEETS_MAP;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string | ClientSheet>;
    const entry = map[slug];
    if (!entry) return null;
    if (typeof entry === 'string') return { spreadsheetId: entry, tabName: process.env.SHEET_TAB_NAME || 'Cadastros' };
    return entry;
  } catch {
    return null;
  }
}

export async function resolveClientSpreadsheetId(slug: string): Promise<ClientSheet | null> {
  if (process.env.REGISTRY_SPREADSHEET_ID) {
    try {
      return await resolveOrCreateClient(slug);
    } catch (err) {
      console.error(`[clients] Erro ao resolver/criar cliente "${slug}":`, err);
      return null;
    }
  }
  return getStaticClientConfig(slug);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{2,60}$/.test(slug);
}

export function slugIsAcceptable(slug: string): boolean {
  if (!isValidSlug(slug)) return false;
  if (process.env.REGISTRY_SPREADSHEET_ID) return true;
  return getStaticClientConfig(slug) !== null;
}
