/**
 * Rate limiter simples em memória para as rotas da API.
 * Para produção com múltiplas instâncias, considere usar Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 30; // máximo por janela

/**
 * Verifica se o IP passou do limite.
 * Retorna true se deve bloquear.
 */
export function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return true;
  }

  return false;
}

// Limpeza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now > val.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
