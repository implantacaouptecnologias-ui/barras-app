import Head from 'next/head';
import { Barcode, Camera, FileSpreadsheet, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: Camera,
    title: 'Escaneie o código de barras',
    description:
      'Use a câmera do seu dispositivo para ler o código de barras do produto. O sistema identifica automaticamente e busca as informações.',
  },
  {
    icon: Barcode,
    title: 'Consulta automática',
    description:
      'O sistema consulta automaticamente o nome do produto e classificação fiscal (NCM), trazendo dados precisos em segundos.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Salvo na planilha',
    description:
      'Todas as informações são organizadas automaticamente na sua planilha, facilitando o controle e gestão do inventário para iniciar o uso dos nossos sistemas.',
  },
  {
    icon: CheckCircle,
    title: 'Pronto para usar',
    description:
      'Assim que finalizar o cadastro é só avisar nosso time de suporte que faremos a implementação dos cadastros para você.',
  },
];

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Cadastro de Produtos · UP Tecnologias</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <img
              src="/logo.webp"
              alt="UP Tecnologias"
              style={{ height: 80, width: 'auto', margin: '0 auto 32px', display: 'block' }}
            />
            <h1 style={{
              fontFamily: 'var(--sans)',
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 16,
              lineHeight: 1.2,
            }}>
              Sistema UP de Cadastro de Produtos
            </h1>
            <p style={{
              fontFamily: 'var(--sans)',
              fontSize: 16,
              color: 'var(--text-muted)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.6,
            }}>
              Simplifique o cadastro de produtos inicial com leitura automática de
              códigos de barras e consulta instantânea de informações.
            </p>
          </div>

          {/* Como funciona */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 40,
            marginBottom: 48,
            boxShadow: 'var(--shadow)',
          }}>
            <h2 style={{
              fontFamily: 'var(--sans)',
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text)',
              textAlign: 'center',
              marginBottom: 36,
            }}>
              Como funciona
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {steps.map(({ icon: Icon, title, description }) => (
                <div key={title} style={{ display: 'flex', gap: 20 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(0, 188, 212, 0.1)',
                      border: '1px solid rgba(0, 188, 212, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={22} color="var(--accent)" />
                    </div>
                  </div>
                  <div>
                    <h3 style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: 6,
                    }}>
                      {title}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 14,
                      color: 'var(--text-muted)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}>
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              color: 'var(--text-dim)',
            }}>
              Sistema desenvolvido para facilitar o cadastro e gestão de produtos por UP Tecnologias.
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
