interface Record {
  codigo_barras: string;
  nome_item: string;
  valor_venda: string;
  data_hora: string;
  origem_nome: string;
}

interface RecentRecordsProps {
  records: Record[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function RecentRecords({ records, loading, total, page, pageSize, onPageChange }: RecentRecordsProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="recent-loading">
        <div className="spinner-small" />
        <span>Carregando histórico...</span>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="recent-empty">
        <span>Nenhum cadastro ainda. Seja o primeiro!</span>
      </div>
    );
  }

  return (
    <div>
      <div className="recent-list">
        {records.map((rec, i) => (
          <div key={`${rec.codigo_barras}-${i}`} className="recent-item">
            <div className="recent-item-left">
              <span className="recent-barcode">{rec.codigo_barras}</span>
              <span className="recent-name">{rec.nome_item}</span>
            </div>
            <div className="recent-item-right">
              <span className="recent-value">R$ {rec.valor_venda}</span>
              <span className="recent-date">{rec.data_hora}</span>
              {rec.origem_nome === 'manual' && (
                <span className="recent-badge-manual">manual</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé: total + paginação */}
      <div className="recent-footer">
        <span className="recent-total">{total} produto{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</span>

        {totalPages > 1 && (
          <div className="recent-pagination">
            <button
              className="recent-page-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              ←
            </button>

            <span className="recent-page-info">{page} / {totalPages}</span>

            <button
              className="recent-page-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
