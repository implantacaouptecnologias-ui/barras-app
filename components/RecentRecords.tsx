/**
 * Lista dos últimos registros cadastrados para o cliente.
 */

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
}

export default function RecentRecords({ records, loading }: RecentRecordsProps) {
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
  );
}
