import { useState, useEffect, useRef, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { slugIsAcceptable } from '@/lib/clients';
import RecentRecords from '@/components/RecentRecords';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

type Step = 'barcode' | 'name' | 'price' | 'confirm';

interface CosmosResult {
  found: boolean;
  name?: string;
  ncm?: string;
}

interface RecentRecord {
  codigo_barras: string;
  nome_item: string;
  valor_venda: string;
  data_hora: string;
  origem_nome: string;
}

interface Props { slug: string; }

const STEP_INDEX: Record<Step, number> = { barcode: 0, name: 1, price: 2, confirm: 3 };

export default function ClientPage({ slug }: Props) {
  const [step, setStep] = useState<Step>('barcode');

  const [barcode, setBarcode] = useState('');
  const [barcodeSource, setBarcodeSource] = useState<'manual' | 'scan'>('manual');
  const [itemName, setItemName] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const [nameSource, setNameSource] = useState<'cosmos' | 'manual'>('manual');
  const [unitType, setUnitType] = useState<'kg' | 'un' | null>(null);
  const [unitTypeError, setUnitTypeError] = useState('');

  const [barcodeError, setBarcodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [valueError, setValueError] = useState('');
  const [scannerTimedOut, setScannerTimedOut] = useState(false);

  const [scannerActive, setScannerActive] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [cosmosResult, setCosmosResult] = useState<CosmosResult | null>(null);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [productImage, setProductImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const [showRecent, setShowRecent] = useState(false);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const [recentTotal, setRecentTotal] = useState(0);
  const PAGE_SIZE = 25;

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  // --- Busca de imagem na etapa de revisão ---------------------------------
  useEffect(() => {
    if (step !== 'confirm' || barcode.length < 8) return;
    let cancelled = false;
    setProductImage(null);
    setImageLoading(true);
    fetch(`/api/product/lookup?barcode=${encodeURIComponent(barcode)}&slug=${slug}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.thumbnail) setProductImage(data.thumbnail);
        if (data.ncm) setCosmosResult(prev => ({ found: prev?.found ?? true, name: prev?.name, ncm: data.ncm }));
      })
      .catch(err => { console.error('[confirm] fetch error:', err); })
      .finally(() => { if (!cancelled) setImageLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, barcode, slug]);

  // --- Cosmos lookup -------------------------------------------------------
  const advanceFromCosmos = useCallback((result: CosmosResult) => {
    if (result.found && result.name) {
      setItemName(result.name);
      setNameSource('cosmos');
      setStep('price');
      setTimeout(() => valueInputRef.current?.focus(), 150);
    } else {
      setNameSource('manual');
      setStep('name');
      setTimeout(() => nameInputRef.current?.focus(), 150);
    }
  }, []);

  const consultCosmos = useCallback(async (code: string) => {
    if (!code || code.length < 4) return;
    setConsulting(true);
    setCosmosResult(null);

    try {
      const res = await fetch(`/api/product/lookup?barcode=${encodeURIComponent(code)}&slug=${slug}`);
      const data = await res.json();
      const result: CosmosResult = res.ok ? data : { found: false };
      setCosmosResult(result);
      advanceFromCosmos(result);
    } catch {
      const result: CosmosResult = { found: false };
      setCosmosResult(result);
      advanceFromCosmos(result);
    } finally {
      setConsulting(false);
    }
  }, [slug, advanceFromCosmos]);

  // Avança da etapa de código: Enter ou botão Continuar
  const handleBarcodeNext = useCallback(async () => {
    if (!barcode.trim()) { setBarcodeError('Informe o código de barras'); return; }
    setBarcodeError('');
    setScannerActive(false);

    // Resultado cosmos já em cache (usuário voltou) — apenas avança
    if (cosmosResult !== null) { advanceFromCosmos(cosmosResult); return; }

    // Verifica se código já está cadastrado
    setConsulting(true);
    try {
      const res = await fetch(`/api/barcode/check?slug=${encodeURIComponent(slug)}&barcode=${encodeURIComponent(barcode.trim())}`);
      const data = await res.json();
      if (data.exists) {
        setBarcodeError('Este código de barras já foi cadastrado.');
        return;
      }
    } catch {
      // Falha na verificação — segue o fluxo normalmente
    } finally {
      setConsulting(false);
    }

    // Código curto manual — pula consulta cosmos
    if (barcodeSource === 'manual' && barcode.length <= 4) {
      setNameSource('manual');
      setStep('name');
      setTimeout(() => nameInputRef.current?.focus(), 150);
      return;
    }

    consultCosmos(barcode);
  }, [barcode, barcodeSource, cosmosResult, advanceFromCosmos, consultCosmos, nameInputRef, slug]);

  // --- Scanner -------------------------------------------------------------
  const handleBarcodeDetected = useCallback((code: string) => {
    setScannerActive(false);
    setScannerTimedOut(false);
    setBarcodeSource('scan');
    setBarcode(code);
    setCosmosResult(null);
    consultCosmos(code);
  }, [consultCosmos]);

  const handleScannerTimeout = useCallback(() => {
    setScannerActive(false);
    setScannerTimedOut(true);
  }, []);

  // --- Step navigation -----------------------------------------------------
  const needsUnitType = barcodeSource === 'manual' && barcode.length <= 4;

  const handleNameNext = () => {
    if (!itemName.trim()) { setNameError('Nome do item obrigatório'); return; }
    if (needsUnitType && !unitType) { setUnitTypeError('Selecione o tipo do produto'); return; }
    setNameError('');
    setUnitTypeError('');
    setStep('price');
    setTimeout(() => valueInputRef.current?.focus(), 150);
  };

  const handleBackFromName = () => {
    setStep('barcode');
    setTimeout(() => barcodeInputRef.current?.focus(), 150);
  };

  const handleBackFromPrice = () => {
    if (nameSource === 'manual') {
      setStep('name');
      setTimeout(() => nameInputRef.current?.focus(), 150);
    } else {
      setStep('barcode');
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    }
  };

  const handlePriceNext = () => {
    const raw = saleValue.replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(raw);
    if (!saleValue.trim() || isNaN(num) || num <= 0) {
      setValueError('Informe um valor válido (ex: 29,90)');
      return;
    }
    setValueError('');
    setStep('confirm');
  };

  const handleBackFromConfirm = () => {
    setStep('price');
    setTimeout(() => valueInputRef.current?.focus(), 150);
  };

  // --- Save ----------------------------------------------------------------
  const handleSave = async () => {
    const raw = saleValue.replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(raw);
    if (!saleValue.trim() || isNaN(num) || num <= 0) {
      setValueError('Informe um valor válido (ex: 29,90)');
      return;
    }
    setValueError('');
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/barcode/save?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, itemName, saleValue, nameSource, unitType: unitType ?? undefined, ncm: cosmosResult?.ncm }),
      });
      const result = await res.json();

      if (res.ok) {
        setStep('barcode');
        setBarcode('');
        setItemName('');
        setSaleValue('');
        setNameSource('manual');
        setUnitType(null);
        setBarcodeSource('manual');
        setCosmosResult(null);
        setScannerActive(false);
        setScannerTimedOut(false);
        setProductImage(null);
        setSubmitStatus({ type: 'success', message: 'Produto cadastrado com sucesso!' });
        if (showRecent) loadRecentRecords(1);
        setTimeout(() => { setSubmitStatus(null); barcodeInputRef.current?.focus(); }, 3000);
      } else {
        setSubmitStatus({ type: 'error', message: result.error || 'Erro ao salvar.' });
      }
    } catch {
      setSubmitStatus({ type: 'error', message: 'Erro de conexão. Tente novamente.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('barcode');
    setBarcode(''); setItemName(''); setSaleValue('');
    setNameSource('manual'); setCosmosResult(null);
    setUnitType(null); setUnitTypeError(''); setBarcodeSource('manual');
    setScannerActive(false); setScannerTimedOut(false); setSubmitStatus(null);
    setBarcodeError(''); setNameError(''); setValueError(''); setProductImage(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 150);
  };

  // --- Recent records ------------------------------------------------------
  const loadRecentRecords = useCallback(async (page = 1) => {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/barcode/recent?slug=${slug}&page=${page}`);
      const data = await res.json();
      if (res.ok) {
        setRecentRecords(data.records || []);
        setRecentTotal(data.total ?? 0);
        setRecentPage(page);
      }
    } catch {}
    finally { setRecentLoading(false); }
  }, [slug]);

  const toggleRecent = () => {
    if (!showRecent) loadRecentRecords(1);
    setShowRecent(v => !v);
  };

  // --- Helpers -------------------------------------------------------------
  const isDone = (s: Step) => STEP_INDEX[step] > STEP_INDEX[s];
  const isActive = (s: Step) => step === s;
  const dotClass = (s: Step) => `step-dot${isDone(s) ? ' done' : isActive(s) ? ' active' : ''}`;
  const labelClass = (s: Step) => `step-label${isDone(s) ? ' done' : isActive(s) ? ' active' : ''}`;

  return (
    <>
      <Head>
        <title>Cadastro · {slug}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="app-wrapper">
        {/* HEADER */}
        <header className="app-header">
          <img src="/logo.webp" alt="Logo" className="app-logo-img" />
          <div>
            <div className="app-title">Cadastro de Produtos</div>
            <div className="app-client-name">{slug}</div>
          </div>
        </header>

        {/* ALERTA GLOBAL */}
        {submitStatus && (
          <div className={`alert alert-${submitStatus.type}`}>
            <span>{submitStatus.message}</span>
          </div>
        )}

        {/* INDICADOR DE ETAPAS */}
        <div className="steps">
          <div className="step-item">
            <div className={dotClass('barcode')}>{isDone('barcode') ? '✓' : '1'}</div>
            <div className={labelClass('barcode')}>Código</div>
          </div>
          <div className={`step-line${isDone('barcode') ? ' done' : ''}`} />
          <div className="step-item">
            <div className={dotClass('name')}>{isDone('name') ? '✓' : '2'}</div>
            <div className={labelClass('name')}>Nome</div>
          </div>
          <div className={`step-line${isDone('name') ? ' done' : ''}`} />
          <div className="step-item">
            <div className={dotClass('price')}>{isDone('price') ? '✓' : '3'}</div>
            <div className={labelClass('price')}>Preço</div>
          </div>
          <div className={`step-line${isDone('price') ? ' done' : ''}`} />
          <div className="step-item">
            <div className={dotClass('confirm')}>4</div>
            <div className={labelClass('confirm')}>Revisar</div>
          </div>
        </div>

        {/* ── ETAPA 1: CÓDIGO DE BARRAS ── */}
        {step === 'barcode' && (
          <div className="card">
            <div className="card-title">Código de barras</div>

            {scannerActive && (
              <BarcodeScanner
                onDetected={handleBarcodeDetected}
                onTimeout={handleScannerTimeout}
                active={scannerActive}
              />
            )}

            {scannerTimedOut && (
              <div className="product-not-found" style={{ marginBottom: 16 }}>
                <span className="product-not-found-icon">⚠</span>
                <div className="product-not-found-text">
                  Produto não encontrado, digite o código de barras manualmente.
                </div>
              </div>
            )}

            <div className="field">
              <label className="field-label">
                Código <span className="required">*</span>
              </label>
              <div className="input-row">
                <input
                  ref={barcodeInputRef}
                  className={`input${barcodeError ? ' input-error' : ''}`}
                  value={barcode}
                  onChange={e => {
                    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 13);
                    setBarcode(onlyDigits);
                    setBarcodeSource('manual');
                    setBarcodeError('');
                    setCosmosResult(null);
                    setScannerTimedOut(false);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleBarcodeNext(); }}
                  placeholder="Ex: 7891234567890"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={13}
                  autoFocus
                />
                <button
                  type="button"
                  className={`btn btn-icon${scannerActive ? ' active' : ''}`}
                  onClick={() => { setScannerActive(v => !v); setScannerTimedOut(false); }}
                  title={scannerActive ? 'Fechar câmera' : 'Abrir câmera'}
                >
                  {scannerActive ? '✕' : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  )}
                </button>
              </div>
              {barcodeError && <p className="field-error">{barcodeError}</p>}
            </div>

            {consulting && (
              <div className="consulting-state">
                <div className="spinner-small" />
                <span>Consultando produto...</span>
              </div>
            )}

            {cosmosResult?.found && cosmosResult.name && !consulting && (
              <div className="product-found">
                <span className="product-found-icon">✓</span>
                <div>
                  <div className="product-found-name">{cosmosResult.name}</div>
                  <div className="product-found-sub">Produto encontrado</div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={handleBarcodeNext}
              disabled={consulting || !barcode.trim()}
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ── ETAPA 2: NOME DO ITEM ── */}
        {step === 'name' && (
          <div className="card">
            <div className="card-title">Nome do item</div>

            <div className="summary-field">
              <span className="summary-field-label">Código</span>
              <span className="summary-field-value">{barcode}</span>
            </div>

            {cosmosResult !== null && !cosmosResult.found && (
              <div className="product-not-found" style={{ marginBottom: 20 }}>
                <span className="product-not-found-icon">⚠</span>
                <div className="product-not-found-text">
                  Código não encontrado. Informe o nome manualmente.
                </div>
              </div>
            )}

            <div className="field">
              <label className="field-label">
                Nome <span className="required">*</span>
              </label>
              <input
                ref={nameInputRef}
                className={`input${nameError ? ' input-error' : ''}`}
                value={itemName}
                onChange={e => { setItemName(e.target.value); setNameError(''); }}
                placeholder="Digite o nome do produto"
                maxLength={60}
                autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter') handleNameNext(); }}
              />
              {nameError && <p className="field-error">{nameError}</p>}
            </div>

            {needsUnitType && (
              <div className="field">
                <label className="field-label">
                  Tipo do produto <span className="required">*</span>
                </label>
                <div className="unit-type-group">
                  <button
                    type="button"
                    className={`unit-type-btn${unitType === 'kg' ? ' selected' : ''}`}
                    onClick={() => { setUnitType('kg'); setUnitTypeError(''); }}
                  >
                    <span className="unit-type-icon">⚖</span>
                    <span className="unit-type-label">Produto por quilo</span>
                    <span className="unit-type-badge">Kg</span>
                  </button>
                  <button
                    type="button"
                    className={`unit-type-btn${unitType === 'un' ? ' selected' : ''}`}
                    onClick={() => { setUnitType('un'); setUnitTypeError(''); }}
                  >
                    <span className="unit-type-icon">📦</span>
                    <span className="unit-type-label">Produto unitário</span>
                    <span className="unit-type-badge">Un</span>
                  </button>
                </div>
                {unitTypeError && <p className="field-error">{unitTypeError}</p>}
              </div>
            )}

            <button type="button" className="btn btn-primary" onClick={handleNameNext}>
              Próximo →
            </button>

            <div className="step-actions">
              <button type="button" className="step-back" onClick={handleBackFromName}>
                ← Voltar
              </button>
              <button type="button" className="step-cancel" onClick={handleReset}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── ETAPA 3: PREÇO ── */}
        {step === 'price' && (
          <div className="card">
            <div className="card-title">Valor de venda</div>

            <div className="summary-field">
              <span className="summary-field-label">Código</span>
              <span className="summary-field-value">{barcode}</span>
            </div>
            <div className="summary-field">
              <span className="summary-field-label">Nome</span>
              <span className="summary-field-value name">{itemName}</span>
            </div>
            {unitType && (
              <div className="summary-field">
                <span className="summary-field-label">Tipo</span>
                <span className="summary-field-value">{unitType === 'kg' ? 'Produto por quilo — Kg' : 'Produto unitário — Un'}</span>
              </div>
            )}

            <div className="field">
              <label className="field-label">
                Valor (R$) <span className="required">*</span>
              </label>
              <input
                ref={valueInputRef}
                className={`input${valueError ? ' input-error' : ''}`}
                value={saleValue}
                onChange={e => { setSaleValue(e.target.value.replace(/[^\d.,]/g, '')); setValueError(''); }}
                placeholder="Ex: 29,90"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handlePriceNext(); }}
              />
              {valueError && <p className="field-error">{valueError}</p>}
            </div>

            <div className="divider" />

            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePriceNext}
            >
              Revisar →
            </button>

            <div className="step-actions">
              <button type="button" className="step-back" onClick={handleBackFromPrice}>
                ← Voltar
              </button>
              <button type="button" className="step-cancel" onClick={handleReset}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── ETAPA 4: REVISAR E CONFIRMAR ── */}
        {step === 'confirm' && (
          <div className="card">
            <div className="card-title">Revisar e confirmar</div>

            {imageLoading && (
              <div className="consulting-state">
                <div className="spinner-small" />
                <span>Buscando imagem do produto...</span>
              </div>
            )}

            {productImage && !imageLoading && (
              <div className="product-image-wrapper">
                <img
                  src={`/api/product/image?url=${encodeURIComponent(productImage)}`}
                  alt={itemName}
                  className="product-image"
                  onError={e => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            )}

            <div className="field">
              <label className="field-label">Código de barras</label>
              <input
                className={`input${barcodeError ? ' input-error' : ''}`}
                value={barcode}
                onChange={e => {
                  setBarcode(e.target.value.replace(/\D/g, '').slice(0, 13));
                  setBarcodeError('');
                }}
                inputMode="numeric"
                autoComplete="off"
                maxLength={13}
              />
              {barcodeError && <p className="field-error">{barcodeError}</p>}
            </div>

            <div className="field">
              <label className="field-label">Nome do produto</label>
              <input
                className={`input${nameError ? ' input-error' : ''}`}
                value={itemName}
                onChange={e => { setItemName(e.target.value.slice(0, 60)); setNameError(''); }}
                autoComplete="off"
                maxLength={60}
              />
              {nameError && <p className="field-error">{nameError}</p>}
            </div>

            {needsUnitType && (
              <div className="field">
                <label className="field-label">Tipo do produto</label>
                <div className="unit-type-group">
                  <button
                    type="button"
                    className={`unit-type-btn${unitType === 'kg' ? ' selected' : ''}`}
                    onClick={() => setUnitType('kg')}
                  >
                    <span className="unit-type-icon">⚖</span>
                    <span className="unit-type-label">Produto por quilo</span>
                    <span className="unit-type-badge">Kg</span>
                  </button>
                  <button
                    type="button"
                    className={`unit-type-btn${unitType === 'un' ? ' selected' : ''}`}
                    onClick={() => setUnitType('un')}
                  >
                    <span className="unit-type-icon">📦</span>
                    <span className="unit-type-label">Produto unitário</span>
                    <span className="unit-type-badge">Un</span>
                  </button>
                </div>
              </div>
            )}

            <div className="field">
              <label className="field-label">Valor de venda (R$)</label>
              <input
                className={`input${valueError ? ' input-error' : ''}`}
                value={saleValue}
                onChange={e => { setSaleValue(e.target.value.replace(/[^\d.,]/g, '')); setValueError(''); }}
                inputMode="decimal"
                autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
              {valueError && <p className="field-error">{valueError}</p>}
            </div>

            <div className="divider" />

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <><div className="spinner" /> Salvando...</>
              ) : 'Salvar produto'}
            </button>

            <div className="step-actions">
              <button type="button" className="step-back" onClick={handleBackFromConfirm} disabled={submitting}>
                ← Voltar
              </button>
              <button type="button" className="step-cancel" onClick={handleReset} disabled={submitting}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* REGISTROS RECENTES */}
        <div style={{ marginTop: 8 }}>
          <div className="section-title">
            <button
              type="button"
              onClick={toggleRecent}
              style={{
                background: 'none', border: 'none', color: 'var(--text)',
                fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 700,
                letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer', padding: 0,
              }}
            >
              {showRecent ? '▲' : '▼'} Últimos cadastros
            </button>
          </div>
          {showRecent && (
            <RecentRecords
              records={recentRecords}
              loading={recentLoading}
              total={recentTotal}
              page={recentPage}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => loadRecentRecords(p)}
            />
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = params?.slug as string;
  if (!slugIsAcceptable(slug)) return { notFound: true };
  return { props: { slug } };
};
