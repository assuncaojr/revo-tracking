import type { CampaignAccess, Method as MethodData } from "../api";
import { duration } from "../format";
import { usePoll } from "../usePoll";

const nf = new Intl.NumberFormat("pt-BR");

function day(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

/** "Como a pesquisa é feita" (D29): o método em palavras, com os números do próprio campo. Nenhum dado de pessoa. */
export function Method({ campaign }: { campaign: CampaignAccess }) {
  const { data, error } = usePoll<MethodData>(`/api/campaigns/${campaign.id}/results/method`, 5 * 60_000);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Carregando…</p>;
  const refusalPct = data.approached ? Math.round((100 * data.refused) / data.approached) : 0;
  return (
    <div className="method">
      <div className="method-numbers">
        <div className="card">
          <strong>{nf.format(data.complete)}</strong>
          <span>entrevistas completas</span>
        </div>
        <div className="card">
          <strong>{data.field_days}</strong>
          <span>
            dias de campo ({day(data.first_day)} a {day(data.last_day)})
          </span>
        </div>
        <div className="card">
          <strong>
            {data.neighborhoods} de {data.neighborhoods_total}
          </strong>
          <span>bairros com entrevistas</span>
        </div>
        <div className="card">
          <strong>{data.interviewers}</strong>
          <span>entrevistadores</span>
        </div>
      </div>

      <div className="card prose">
        <h3>Como a pesquisa é feita</h3>
        <p>
          <strong>Quem é ouvido.</strong> Eleitores da cidade: as primeiras perguntas confirmam que a pessoa mora e vota
          ali e tem a idade mínima. Os entrevistadores vão a pontos definidos em cada bairro, em dias e horários alternados, e
          cada bairro é visitado por mais de um entrevistador, para que nenhum dia ou pessoa pese demais.
        </p>
        <p>
          <strong>Como é a entrevista.</strong> Presencial, num celular nosso, com o questionário aprovado pela
          campanha
          {data.questionnaire && ` (versão ${data.questionnaire.version}${data.questionnaire.approved_at ? `, aprovada em ${new Date(data.questionnaire.approved_at).toLocaleDateString("pt-BR")}` : ""})`}
          . Dura em média {duration(data.median_duration_s)}. As respostas são anônimas: nome e telefone só são pedidos
          a quem aceita ser contatado, e ficam guardados à parte.
        </p>
        <p>
          <strong>Quantos aceitaram.</strong> Das {nf.format(data.approached)} pessoas abordadas, {nf.format(data.refused)}{" "}
          ({refusalPct}%) não quiseram participar e {nf.format(data.screened_out)} não eram do público da pesquisa (não
          moram ou não votam na cidade, ou estão abaixo da idade mínima).
        </p>
        <p>
          <strong>Controle de qualidade.</strong> Cada entrevista é conferida automaticamente: tempo, localização (
          {data.with_location_pct ?? "—"}% com GPS), respostas contraditórias, entrevistas coladas umas nas outras. As
          suspeitas são revisadas pela nossa equipe: {nf.format(data.reviewed)} revisadas até agora (
          {nf.format(data.excluded)} excluídas dos resultados) e {nf.format(data.pending_review)} aguardando revisão,
          que contam nos resultados até serem revisadas.
        </p>
        <p>
          <strong>Como ler os números.</strong> Os resultados são brutos: mostram o que os entrevistados responderam,
          ainda sem ajuste pelo perfil do eleitorado da cidade, e não são previsão de eleição. Toda pesquisa tem margem
          de erro; quando a diferença entre dois números é menor que ela, o painel diz “empate técnico” ou “como a
          cidade”. Grupos com menos de {data.min_cell} entrevistas não aparecem, porque dariam números enganosos.
        </p>
        <p className="muted small">
          Pesquisa de uso interno da campanha: não é registrada no TSE e não pode ser divulgada.
        </p>
      </div>
    </div>
  );
}
