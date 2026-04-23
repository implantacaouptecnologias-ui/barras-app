import { z } from 'zod';

/**
 * Normaliza valor monetário brasileiro para número float.
 * Aceita: "29,90" | "29.90" | "R$ 29,90" | "1.234,56"
 */
export function parseMonetaryValue(raw: string): number {
  const clean = raw
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')   // remove separadores de milhar
    .replace(',', '.')    // troca vírgula decimal por ponto
    .trim();
  return parseFloat(clean);
}

/**
 * Formata número para string com 2 casas decimais (para gravar na planilha).
 */
export function formatValue(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

// Schema de salvamento de produto
export const saveProductSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(1, 'Código de barras obrigatório')
    .regex(/^\d+$/, 'Código de barras deve conter apenas dígitos'),

  itemName: z
    .string()
    .min(1, 'Nome do item obrigatório')
    .max(60, 'Nome muito longo')
    .transform((v) => v.replace(/[\x00-\x1F\x7F]/g, '').trim()),

  saleValue: z
    .string()
    .min(1, 'Valor de venda obrigatório')
    .refine((v) => {
      const n = parseMonetaryValue(v);
      return !isNaN(n) && n > 0;
    }, 'Valor de venda inválido'),

  nameSource: z.enum(['cosmos', 'manual']),
  unitType: z.enum(['kg', 'un']).optional(),
  ncm: z.string().max(20).optional(),
});

export type SaveProductInput = z.infer<typeof saveProductSchema>;
