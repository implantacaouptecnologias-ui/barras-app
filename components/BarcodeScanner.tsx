/**
 * Componente de leitura de código de barras via câmera.
 * Usa html5-qrcode. Ativa câmera traseira por padrão em dispositivos móveis.
 * Implementa debounce para evitar leituras duplicadas.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  active: boolean;
}

export default function BarcodeScanner({ onDetected, active }: BarcodeScannerProps) {
  const scannerRef = useRef<unknown>(null);
  const lastCodeRef = useRef<string>('');
  const lockRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setIsLoading(true);
    setError('');

    try {
      // Importa dinamicamente para evitar SSR issues
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('barcode-reader');
      scannerRef.current = scanner;

      // Tenta câmera traseira primeiro
      const cameras = await Html5Qrcode.getCameras();
      let cameraId: string | { facingMode: string } = { facingMode: 'environment' };

      if (cameras && cameras.length > 0) {
        // Prefere câmera com "back" ou "environment" no nome
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
        {
          fps: 10,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.5,
        },
        (decodedText) => {
          // Debounce: ignora leitura duplicada em 2 segundos
          if (lockRef.current || decodedText === lastCodeRef.current) return;

          lockRef.current = true;
          lastCodeRef.current = decodedText;
          onDetected(decodedText.trim());

          setTimeout(() => {
            lockRef.current = false;
          }, 2000);
        },
        () => {
          // Erro silencioso durante scan (frame inválido)
        }
      );

      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission') || msg.includes('NotAllowedError')) {
        setError('Permissão de câmera negada. Permita o acesso nas configurações do navegador.');
      } else if (msg.includes('NotFoundError')) {
        setError('Nenhuma câmera encontrada neste dispositivo.');
      } else {
        setError('Erro ao iniciar câmera. Tente digitar o código manualmente.');
      }
      console.error('[BarcodeScanner]', err);
    }
  }, [onDetected]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scanner = scannerRef.current as any;
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch {
        // Ignora erros ao parar
      }
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (active) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
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
          Aponte a câmera para o código de barras
        </p>
      )}
    </div>
  );
}
