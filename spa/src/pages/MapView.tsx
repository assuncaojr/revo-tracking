import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CampaignAccess, CoverageMap, OpinionMap } from "../api";
import { duration, FLAG_LABELS, STATUS_LABELS, timeOf } from "../format";
import { usePoll } from "../usePoll";
import { fmt, margin } from "./Overview";
import { TONE_COLORS, TONE_LABELS, TONE_ORDER, toneOf } from "../tone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Legend, Segmented, SelectField } from "@/components/controls";
import { ChartCard, ErrorState, Toolbar } from "@/components/page";

// Hexágono pintado pela comparação com a média da área inteira (tone.ts): azul = mais favorável à gestão,
// vermelho = menos, cinza = igual dentro da margem. Leitura direta para quem não é técnico.
const SUPPRESSED = "#eef1fd";
const COMPLETE = "#0a6fd8";
const NOT_COMPLETE = "#9aa6c8";
const FLAGGED = "#d92d3a"; // cor de status (crítico), sempre com rótulo na legenda

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Mapa Leaflet controlado por fora: `draw` redesenha a camada de dados sem recriar o mapa. */
function useLeaflet(draw: (map: L.Map, layer: L.LayerGroup) => void, deps: unknown[]) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: false, center: [-4.859, -43.356], zoom: 13 });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    draw(map.current, layer.current);
  }, deps);
  return el;
}

export function MapView({ campaign }: { campaign: CampaignAccess }) {
  const [mode, setMode] = useState<"opinion" | "coverage">("opinion");
  return (
    <>
      {campaign.staff && (
        <Segmented
          className="mb-4"
          value={mode}
          onChange={setMode}
          size="sm"
          options={[
            { value: "opinion", label: "Opinião por região" },
            { value: "coverage", label: "Cobertura do campo (equipe)" },
          ]}
        />
      )}
      {mode === "opinion" ? (
        <Opinion campaign={campaign} />
      ) : (
        <Coverage campaignId={campaign.id} />
      )}
    </>
  );
}

// --- opinião em hexágonos ---

function Opinion({ campaign }: { campaign: CampaignAccess }) {
  const [period, setPeriod] = useState<"7d" | "all">("all");
  const [indicator, setIndicator] = useState("approval");
  const [size, setSize] = useState<number | null>(null);
  const { data, error } = usePoll<OpinionMap>(
    `/api/campaigns/${campaign.id}/results/map?period=${period}&indicator=${indicator}${size ? `&size=${size}` : ""}`,
    5 * 60_000,
  );
  const mean = data?.indicator.mean ?? false;
  const ref = data?.total?.value;
  const [fitted, setFitted] = useState(false);

  const el = useLeaflet(
    (map, layer) => {
      if (!data) return;
      for (const c of data.cells) {
        const tone = toneOf(c, ref, data.indicator.favorable, mean);
        const poly = L.polygon(c.polygon, {
          color: tone ? "#ffffff" : "#c3cae0",
          weight: 1.5,
          fillColor: tone ? TONE_COLORS[tone] : SUPPRESSED,
          fillOpacity: tone ? 0.78 : 0.5,
        });
        const body = tone
          ? `<strong>${fmt(c.value, mean)}</strong> ${margin(c, mean)} · média ${fmt(ref, mean)}<br>` +
            `${TONE_LABELS[tone]}<br><span class="muted">${c.n} entrevistas</span>`
          : `<span class="muted">${c.interviews} entrevistas: poucas para mostrar o resultado</span>`;
        poly.bindTooltip(`${escape(data.indicator.label)}<br>${body}`, { sticky: true });
        poly.addTo(layer);
      }
      if (data.bounds && !fitted) {
        map.fitBounds(data.bounds, { padding: [20, 20] });
        setFitted(true);
      }
    },
    [data],
  );

  return (
    <>
      <Toolbar>
        <SelectField
          label="Indicador"
          value={indicator}
          onChange={setIndicator}
          options={(data?.indicators ?? []).map((i) => ({ value: i.key, label: i.label }))}
        />
        <SelectField
          label="Período"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "all", label: "Todo o período" },
            { value: "7d", label: "Últimos 7 dias" },
          ]}
        />
        <SelectField
          label="Tamanho da região"
          value={String(size ?? data?.size_m ?? 500)}
          onChange={(v) => setSize(Number(v))}
          options={(data?.sizes ?? [300, 500, 800, 1200]).map((s) => ({
            value: String(s),
            label: s < 1000 ? `${s} m` : `${(s / 1000).toLocaleString("pt-BR")} km`,
          }))}
        />
      </Toolbar>
      {error && <ErrorState>{error}</ErrorState>}
      <ChartCard
        title={`${data?.indicator.label ?? "…"} por região`}
        description={
          <>
            Cada hexágono junta as entrevistas feitas naquela área
            {data && ` (${data.n_located} de ${data.n} com localização boa)`}. Passe o mouse para ver o valor, a margem
            e o número de entrevistas.
            {data && ` Hexágonos com menos de ${data.min_cell} entrevistas ficam em cinza, sem valor.`} Áreas maiores
            juntam mais entrevistas e escondem menos.
          </>
        }
      >
        <div className="map" ref={el} />
        {data && ref != null && (
          <>
            <p className="mt-3 mb-1.5 text-sm text-muted-foreground">Comparado com a média da área ({fmt(ref, mean)}):</p>
            <Legend
              items={[
                ...TONE_ORDER.map((t) => ({ color: TONE_COLORS[t], label: TONE_LABELS[t] })),
                { color: SUPPRESSED, label: "poucas entrevistas", outline: "#c3cae0" },
              ]}
            />
          </>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Mostra onde entrevistamos, não a cidade inteira: área sem hexágono é área sem entrevista. Resultado bruto, sem
          ponderação.
        </p>
      </ChartCard>
    </>
  );
}

// --- cobertura do campo (só equipe) ---

function Coverage({ campaignId }: { campaignId: string }) {
  const [day, setDay] = useState("");
  const { data, error } = usePoll<CoverageMap>(`/api/campaigns/${campaignId}/field/map${day ? `?day=${day}` : ""}`);
  const el = useLeaflet(
    (map, layer) => {
      if (!data) return;
      const bounds: [number, number][] = [];
      for (const p of data.points) {
        L.circleMarker([p.lat, p.lng], { radius: 7, color: "#0b1440", weight: 2, fillOpacity: 0 })
          .bindTooltip(`Ponto de trabalho: ${escape(p.name)}`)
          .addTo(layer);
        bounds.push([p.lat, p.lng]);
      }
      for (const i of data.interviews) {
        const flagged = i.flags.length > 0;
        const fill = i.status === "complete" ? COMPLETE : NOT_COMPLETE;
        const tip =
          `<strong>${escape(i.interviewer)}</strong> · ${timeOf(i.started_at)} · ${duration(i.duration_s)}<br>` +
          `${STATUS_LABELS[i.status] ?? i.status} · ${escape(i.point)}` +
          (i.accuracy_m != null ? ` · GPS ±${Math.round(i.accuracy_m)} m` : "") +
          (flagged ? `<br><strong>Alerta:</strong> ${i.flags.map((f) => FLAG_LABELS[f] ?? f).join(", ")}` : "") +
          (i.excluded ? "<br>Excluída dos resultados" : "");
        L.circleMarker([i.lat, i.lng], {
          radius: 5,
          color: flagged ? FLAGGED : "#ffffff",
          weight: flagged ? 2.5 : 1.5,
          fillColor: fill,
          fillOpacity: 0.9,
        })
          .bindTooltip(tip)
          .addTo(layer);
        if (!i.far) bounds.push([i.lat, i.lng]);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    },
    [data],
  );
  return (
    <>
      <Toolbar>
        <div className="flex items-center gap-2">
          <Label htmlFor="coverage-day" className="text-muted-foreground">
            Dia
          </Label>
          <Input id="coverage-day" type="date" className="w-auto bg-card" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} entrevistas no dia
            {data.without_location > 0 && ` · ${data.without_location} sem localização (não aparecem)`}
            {data.interviews.some((i) => i.far) &&
              ` · ${data.interviews.filter((i) => i.far).length} longe demais da cidade (GPS errado ou aparelho de teste; afaste o zoom para ver)`}
          </span>
        )}
      </Toolbar>
      {error && <ErrorState>{error}</ErrorState>}
      <ChartCard
        title="Onde a equipe entrevistou"
        description="Uso interno: cada ponto é uma entrevista. Não mostrar ao cliente (D26). Passe o mouse para ver quem, quando e os alertas."
      >
        <div className="map" ref={el} />
        <div className="legend map-legend text-muted-foreground">
          <span>
            <i style={{ background: COMPLETE }} /> Completa
          </span>
          <span>
            <i style={{ background: NOT_COMPLETE }} /> Recusa, filtrada ou interrompida
          </span>
          <span>
            <i className="ring-swatch" style={{ borderColor: FLAGGED }} /> Com alerta aberto
          </span>
          <span>
            <i className="ring-swatch" style={{ borderColor: "#0b1440" }} /> Ponto de trabalho
          </span>
        </div>
      </ChartCard>
    </>
  );
}
