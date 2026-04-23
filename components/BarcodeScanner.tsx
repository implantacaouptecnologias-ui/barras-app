import { useEffect, useRef, useState, useCallback } from 'react';

const TIMEOUT_SECONDS = 10;

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onTimeout: () => void;
  active: boolean;
}

export default function BarcodeScanner({ onDetected, onTimeout, active }: BarcodeScannerProps) {
  const scannerRef = useRef<unknown>(null);
  const startingRef = useRef(false);
  const lastCodeRef = useRef<string>('');
  const lockRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const stopScanner = useCallback(async () => {
    clearTimers();
    startingRef.current = false;
    if (scannerRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scanner = scannerRef.current as any;
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch {
        // ignora erros ao parar
      }
      scannerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, [clearTimers]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current || startingRef.current || !containerRef.current) return;
    startingRef.current = true;
    setIsLoading(true);
    setError('');
    setSecondsLeft(TIMEOUT_SECONDS);
    containerRef.current.innerHTML = '';

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('barcode-reader');
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      let cameraId: string | { facingMode: string } = { facingMode: 'environment' };

      if (cameras && cameras.length > 0) {
        const backCam = cameras.find(
          (c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('traseira') ||
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
        );
        cameraId = backCam ? backCam.id : cameras[cameras.length - 1].id;
      }

      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.777 },
        (decodedText) => {
          if (lockRef.current || decodedText === lastCodeRef.current) return;
          lockRef.current = true;
          lastCodeRef.current = decodedText;
          clearTimers();
          onDetected(decodedText.trim());
          setTimeout(() => { lockRef.current = false; }, 2000);
        },
        () => { /* frames inválidos — silencioso */ }
      );

      setIsLoading(false);

      // Inicia contagem regressiva visual
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => s - 1);
      }, 1000);

      // Timeout de 20s — fecha câmera e notifica o pai
      timeoutRef.current = setTimeout(async () => {
        clearTimers();
        await stopScanner();
        onTimeout();
      }, TIMEOUT_SECONDS * 1000);

    } catch (err) {
      setIsLoading(false);
      scannerRef.current = null;
      startingRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      if (!window.isSecureContext) {
        setError('Câmera requer HTTPS. Use o link do ngrok ou acesse pelo Vercel.');
      } else if (msg.includes('permission') || msg.includes('NotAllowedError')) {
        setError('Permissão negada. Permita o acesso à câmera nas configurações do navegador.');
      } else if (msg.includes('NotFoundError')) {
        setError('Nenhuma câmera encontrada neste dispositivo.');
      } else {
        setError('Erro ao iniciar câmera. Tente digitar o código manualmente.');
      }
      console.error('[BarcodeScanner]', err);
    }
  }, [onDetected, onTimeout, clearTimers, stopScanner]);

  useEffect(() => {
    if (active) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [active, startScanner, stopScanner]);

  return (
    <div className="scanner-wrapper">
      {isLoading && (
        <div className="scanner-loading">
          <div className="spinner-small" />
          <span>Iniciando câmera...</span>
        </div>
      )}
      {error && (
        <div className="scanner-error">
          <span>⚠️ {error}</span>
        </div>
      )}
      <div
        id="barcode-reader"
        ref={containerRef}
        style={{ width: '100%', display: active ? 'block' : 'none' }}
      />
      {active && !error && !isLoading && (
        <p className="scanner-hint">
          Aponte a câmera para o código de barras · {secondsLeft}s
        </p>
      )}
    </div>
  );
}
