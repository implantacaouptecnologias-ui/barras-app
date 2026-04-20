import Head from 'next/head';

export default function Custom404() {
  return (
    <>
      <Head>
        <title>Cliente não encontrado</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="not-found-page">
        <div className="not-found-card">
          <div className="not-found-code">404</div>
          <div className="not-found-title">Cliente não encontrado</div>
          <p className="not-found-desc">
            A rota acessada não corresponde a nenhum cliente cadastrado.<br />
            Verifique o endereço e tente novamente.
          </p>
        </div>
      </div>
    </>
  );
}
