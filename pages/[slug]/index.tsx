/**
 * Página principal por cliente: /{slug}
 * Toda a lógica do formulário de cadastro de código de barras.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { slugIsAcceptable } from '@/lib/clients';
import RecentRecords from '@/components/RecentRecords';

// Importa scanner apenas no cliente (sem SSR)
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

// --- Schema do formulário -----------------------------------------------------
const formSchema = z.object({
  barcode: z.string().min(1, 'Código de barras obrigatório'),
  itemName: z.string().min(1, 'Nome do item obrigatório').max(200),
  saleValue: z
    .string()
    .min(1, 'Valor de venda obrigatório')
    .refine((v) => {
      const n = parseFloat(v.replace(',', '.').replace(/[^\d.]/g, ''));
      return !isNaN(n) && n > 0;
    }, 'Valor inválido (ex: 29,90)'),
});

type FormData = z.infer<typeof formSchema>;

interface CosmosResult {
  found: boolean;
  name?: string;
}

interface RecentRecord {
  codigo_barras: string;
  nome_item: string;
  valor_venda: string;
  data_hora: string;
  origem_nome: string;
}

interface Props {
  slug: string;
}

export default function ClientPage({ slug }: Props) {
  const [scannerActive, setScannerActive] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [cosmosResult, setCosmosResult] = useState<CosmosResult | null>(null);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const consultDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemNameRef = useRef<HTMLInputElement>(null);
  const saleValueRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { barcode: '', itemName: '', saleValue: '' },
  });

  const barcodeValue = watch('barcode');

  // --- Consulta COSMOS -------------------------------------------------------
  const consultCosmos = useCallback(
    async (code: string) => {
      if (!code || code.length < 4) return;

      setConsulting(true);
      setCosmosResult(null);
      setValue('itemName', '');

      try {
        const res = await fetch(
          `/api/product/lookup?barcode=${encodeURIComponent(code)}&slug=${slug}`
        );
        const data = await res.json();

        if (res.ok) {
          setCosmosResult(data);
          if (data.found && data.name) {
            setValue('itemName', data.name);
            // Foca no campo de valor
            setTimeout(() => saleValueRef.current?.focus(), 100);
          } else {
            // Produto não encontrado — foca no nome
            setTimeout(() => itemNameRef.current?.focus(), 100);
          }
        } else {
          setCosmosResult({ found: false });
          setTimeout(() => itemNameRef.current?.focus(), 100);
        }
      } catch {
        setCosmosResult({ found: false });
      } finally {
        setConsulting(false);
      }
    },
    [slug, setValue]
  );

  // Debounce ao digitar o código
  useEffect(() => {
    if (!barcodeValue) {
      setCosmosResult(null);
      return;
    }
    if (consultDebounce.current) clearTimeout(consultDebounce.current);
    consultDebounce.current = setTimeout(() => {
      consultCosmos(barcodeValue);
    }, 800);
    return () => {
      if (consultDebounce.current) clearTimeout(consultDebounce.current);
    };
  }, [barcodeValue, consultCosmos]);

  // --- Leitura de câmera -----------------------------------------------------
  const handleBarcodeDetected = useCallback(
    (code: string) => {
      setScannerActive(false);
      setValue('barcode', code);
      consultCosmos(code);
    },
    [setValue, consultCosmos]
  );

  // --- Submissão -------------------------------------------------------------
  const onSubmit = async (data: FormData) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitStatus(null);

    const nameSource = cosmosResult?.found ? 'cosmos' : 'manual';

    try {
      const res = await fetch(`/api/barcode/save?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, nameSource }),
      });

      const result = await res.json();

      if (res.ok) {
        setSubmitStatus({ type: 'success', message: '? Produto cadastrado com sucesso!' });
        reset();
        setCosmosResult(null);
        setScannerActive(false);
        // Recarrega registros recentes
        if (showRecent) loadRecentRecords();
        setTimeout(() => {
          setSubmitStatus(null);
          setFocus('barcode');
        }, 3000);
      } else {
        setSubmitStatus({ type: 'error', message: result.error || 'Erro ao salvar.' });
      }
    } catch {
      setSubmitStatus({ type: 'error', message: 'Erro de conexão. Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Limpar formulário -----------------------------------------------------
  const handleClear = () => {
    reset();
    setCosmosResult(null);
    setSubmitStatus(null);
    setScannerActive(false);
    setFocus('barcode');
  };

  // --- Registros recentes ----------------------------------------------------
  const loadRecentRecords = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/barcode/recent?slug=${slug}`);
      const data = await res.json();
      if (res.ok) setRecentRecords(data.records || []);
    } catch {
      // silencioso
    } finally {
      setRecentLoading(false);
    }
  }, [slug]);

  const toggleRecent = () => {
    if (!showRecent) loadRecentRecords();
    setShowRecent((v) => !v);
  };

  // --- Registra o ref do campo itemName para foco programático --------------
  const { ref: itemNameFormRef, ...itemNameRest } = register('itemName');
  const { ref: saleValueFormRef, ...saleValueRest } = register('saleValue');

  return (
    <>
      <Head>
        <title>Cadastro · {slug}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content={`Cadastro de produtos — ${slug}`} />
      </Head>

      <div className="app-wrapper">
        {/* HEADER */}
        <header className="app-header">
          <div className="app-logo">¦¦</div>
          <div>
            <div className="app-title">Cadastro de Produtos</div>
            <div className="app-client-name">{slug}</div>
          </div>
        </header>

        {/* ALERTA DE SUCESSO / ERRO GLOBAL */}
        {submitStatus && (
          <div className={`alert alert-${submitStatus.type}`}>
            <span className="alert-icon">
              {submitStatus.type === 'success' ? '?' : '?'}
            </span>
            <span>{submitStatus.message}</span>
          </div>
        )}

        {/* FORMULÁRIO PRINCIPAL */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="card">
            <div className="card-title">01 — Código de barras</div>

            {/* Scanner de câmera */}
            {scannerActive && (
              <BarcodeScanner onDetected={handleBarcodeDetected} active={scannerActive} />
            )}

            {/* Campo de código + botão câmera */}
            <div className="field">
              <label className="field-label">
                Código <span className="required">*</span>
              </label>
              <div className="input-row">
                <input
                  {...register('barcode')}
                  className={`input ${errors.barcode ? 'input-error' : ''}`}
                  placeholder="Ex: 7891234567890"
                  autoComplete="off"
                  inputMode="numeric"
                  autoFocus
                />
                <button
                  type="button"
                  className={`btn btn-icon ${scannerActive ? 'active' : ''}`}
                  title={scannerActive ? 'Fechar câmera' : 'Abrir câmera'}
                  onClick={() => setScannerActive((v) => !v)}
                  aria-label="Alternar câmera"
                >
                  {scannerActive ? '?' : '??'}
                </button>
              </div>
              {errors.barcode && (
                <p className="field-error">? {errors.barcode.message}</p>
              )}
            </div>

            {/* Status COSMOS */}
            {consulting && (
              <div className="consulting-state">
                <div className="spinner-small" />
                <span>Consultando produto...</span>
              </div>
            )}

            {cosmosResult?.found && cosmosResult.name && (
              <div className="product-found">
                <span className="product-found-icon">?</span>
                <div>
                  <div className="product-found-name">{cosmosResult.name}</div>
                  <div className="product-found-sub">Produto encontrado via COSMOS</div>
                </div>
              </div>
            )}

            {cosmosResult && !cosmosResult.found && barcodeValue && (
              <div className="product-not-found">
                <span className="product-not-found-icon">?</span>
                <div className="product-not-found-text">
                  Código não encontrado no COSMOS. Informe o nome manualmente abaixo.
                </div>
              </div>
            )}
          </div>

          {/* NOME DO ITEM */}
          <div className="card">
            <div className="card-title">02 — Nome do item</div>
            <div className="field">
              <label className="field-label">
                Nome <span className="required">*</span>
                {cosmosResult?.found && (
                  <span style={{ color: 'var(--accent-green)', marginLeft: 6, fontWeight: 400 }}>
                    (preenchido automaticamente)
                  </span>
                )}
              </label>
              <input
                {...itemNameRest}
                ref={(e) => {
                  itemNameFormRef(e);
                  (itemNameRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
                }}
                className={`input ${errors.itemName ? 'input-error' : ''} ${
                  cosmosResult?.found ? 'input-success' : ''
                }`}
                placeholder={
                  cosmosResult?.found
                    ? 'Nome do produto (COSMOS)'
                    : 'Digite o nome do produto'
                }
                readOnly={cosmosResult?.found === true}
              />
              {errors.itemName && (
                <p className="field-error">? {errors.itemName.message}</p>
              )}
            </div>
          </div>

          {/* VALOR DE VENDA */}
          <div className="card">
            <div className="card-title">03 — Valor de venda</div>
            <div className="field">
              <label className="field-label">
                Valor (R$) <span className="required">*</span>
              </label>
              <input
                {...saleValueRest}
                ref={(e) => {
                  saleValueFormRef(e);
                  (saleValueRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
                }}
                className={`input ${errors.saleValue ? 'input-error' : ''}`}
                placeholder="Ex: 29,90"
                inputMode="decimal"
                autoComplete="off"
              />
              {errors.saleValue && (
                <p className="field-error">? {errors.saleValue.message}</p>
              )}
            </div>

            <div className="divider" />

            {/* BOTÕES DE AÇÃO */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <div className="spinner" />
                  Salvando...
                </>
              ) : (
                'Salvar produto'
              )}
            </button>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClear}
                disabled={submitting}
              >
                Limpar formulário
              </button>
            </div>
          </div>
        </form>

        {/* REGISTROS RECENTES */}
        <div style={{ marginTop: 8 }}>
          <div className="section-title">
            <button
              type="button"
              onClick={toggleRecent}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showRecent ? '?' : '?'} Últimos cadastros
            </button>
          </div>

          {showRecent && (
            <RecentRecords records={recentRecords} loading={recentLoading} />
          )}
        </div>
      </div>
    </>
  );
}

// --- Server-side: valida se o slug tem formato válido ------------------------
export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = params?.slug as string;

  if (!slugIsAcceptable(slug)) {
    return { notFound: true };
  }

  return { props: { slug } };
};