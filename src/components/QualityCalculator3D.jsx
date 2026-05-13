import { useState, useCallback, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── jsPDF dynamic import ──────────────────────────────────────────────────────
let jsPDFLib = null;
async function getJsPDF() {
  if (jsPDFLib) return jsPDFLib;
  const mod = await import("jspdf");
  jsPDFLib = mod.jsPDF || mod.default;
  return jsPDFLib;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const scoreColor = s =>
  s === null ? "#c8d0dc"
  : s >= 4 ? "#16a34a"
  : s >= 3 ? "#2563eb"
  : s >= 2 ? "#d97706"
  : "#dc2626";

const QUALITY = [
  { min: 4.0, en: "Excellent",      pt: "Excelente",      color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  { min: 3.0, en: "Good",           pt: "Boa",            color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { min: 2.0, en: "Regular",        pt: "Regular",        color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { min: 0,   en: "Unsatisfactory", pt: "Insatisfatória", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
];
const getQuality    = s => QUALITY.find(q => s >= q.min) || QUALITY[3];
const scoreRangeLbl = q =>
  q.en === "Excellent" ? "4.00 – 5.00"
  : q.en === "Good"    ? "3.00 – 3.99"
  : q.en === "Regular" ? "2.00 – 2.99"
  :                      "1.00 – 1.99";

// ── Dimensional fidelity → score (Li et al., 2023 Eq. 8) ─────────────────────
// Scale: 10-point intervals across realistic food printing range
function fidelidadeToScore(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  if (n >= 91.0) return 5;
  if (n >= 81.0) return 4;
  if (n >= 71.0) return 3;
  if (n >= 61.0) return 2;
  return 1;
}

// ── Parameters ────────────────────────────────────────────────────────────────
const PARAMS = [
  {
    key: "dimensionalFidelity",
    en: "Dimensional Fidelity", pt: "Fidelidade Dimensional",
    weight: 0.30, type: "objective",
    inputLabelEn: "Print Precision (%)", inputLabelPt: "Precisão de Impressão (%)",
    placeholder: "e.g. 99.83",
    converter: fidelidadeToScore,
    descEn: "Accuracy of printed dimensions vs. digital model, averaged across X, Y and Z axes (Eq. 8).",
    descPt: "Acurácia das dimensões impressas vs. modelo digital, média dos eixos X, Y e Z (Eq. 8).",
    scaleRows: [
      [5, "91 – 100%", "Excellent — high fidelity across all axes"],
      [4, "81 – 90%",  "Good — minor deviations, generally acceptable"],
      [3, "71 – 80%",  "Regular — noticeable deviation in at least one axis"],
      [2, "61 – 70%",  "Poor — significant dimensional deviation"],
      [1, "< 61%",     "Unsatisfactory — does not reproduce model geometry"],
    ],
  },
  {
    key: "layerAdhesion",
    en: "Layer Adhesion", pt: "Adesão entre Camadas",
    weight: 0.25, type: "qualitative", moment: "post",
    descEn: "Bond quality between printed layers. Assess visually: delamination, cracks, inter-layer gaps.",
    descPt: "Qualidade da adesão entre camadas. Avaliar visualmente: delaminação, fissuras, lacunas entre camadas.",
    scaleRows: [
      [5, "—", "Perfectly fused layers — continuous structure, no visible interface lines"],
      [4, "—", "Good adhesion — rare surface irregularities, no delamination"],
      [3, "—", "Acceptable — some visible interface lines, occasional irregularity"],
      [2, "—", "Poor — frequent layer separation, visible gaps"],
      [1, "—", "Unsatisfactory — extensive delamination, structure fails to hold"],
    ],
  },
  {
    key: "extrusionConsistency",
    en: "Extrusion Consistency", pt: "Consistência da Extrusão",
    weight: 0.20, type: "qualitative", moment: "during",
    descEn: "Uniformity of material flow in real time: lumps, dripping, dragging, start/stop defects.",
    descPt: "Uniformidade do fluxo em tempo real: grumos, pingos, arraste, defeitos de início/parada.",
    scaleRows: [
      [5, "—", "Continuous, uniform filament throughout — no defects observed"],
      [4, "—", "Mostly uniform — rare minor dripping or slight drag at path changes"],
      [3, "—", "Some inconsistency — occasional lumps or minor interruptions"],
      [2, "—", "Frequent defects — dripping, dragging or irregular flow"],
      [1, "—", "Unsatisfactory — continuous interruptions, filament cannot be maintained"],
    ],
  },
  {
    key: "structuralQuality",
    en: "Structural Quality", pt: "Qualidade Estrutural",
    weight: 0.15, type: "qualitative", moment: "post",
    descEn: "Overall structural integrity after printing: shape retention, resistance to collapse.",
    descPt: "Integridade estrutural geral após impressão: retenção de forma, resistência ao colapso.",
    scaleRows: [
      [5, "—", "Structurally intact — shape fully retained, no visible collapse"],
      [4, "—", "Good — minor deformation, shape generally preserved"],
      [3, "—", "Regular — visible deformation in some regions"],
      [2, "—", "Poor — significant collapse, shape substantially altered"],
      [1, "—", "Unsatisfactory — severe collapse, structure lost"],
    ],
  },
  {
    key: "surfaceFinish",
    en: "Surface Finish", pt: "Acabamento Superficial",
    weight: 0.05, type: "qualitative", moment: "post",
    descEn: "External surface quality: roughness, edge definition, uniformity.",
    descPt: "Qualidade da superfície externa: rugosidade, bordas, uniformidade.",
    scaleRows: [
      [5, "—", "Smooth, uniform surface — no visible defects, well-defined edges"],
      [4, "—", "Good finish — minor surface roughness, edges mostly defined"],
      [3, "—", "Acceptable — some texture variation, minor edge imperfections"],
      [2, "—", "Rough surface — significant irregularities, poorly defined edges"],
      [1, "—", "Very rough/irregular — major surface defects, no edge definition"],
    ],
  },
  {
    key: "fillUniformity",
    en: "Fill Uniformity", pt: "Uniformidade do Preenchimento",
    weight: 0.05, type: "qualitative", moment: "post",
    descEn: "Completeness and consistency of infill across replicates: voids, pattern breaks.",
    descPt: "Completude e consistência do preenchimento entre replicatas: vazios, falhas no padrão.",
    scaleRows: [
      [5, "—", "Complete, uniform fill — pattern identical across all replicates, no voids"],
      [4, "—", "Good uniformity — minor variation between replicates, rare small voids"],
      [3, "—", "Acceptable — some voids or pattern breaks, noticeable inter-sample variation"],
      [2, "—", "Poor — frequent voids, irregular pattern, significant variation"],
      [1, "—", "Unsatisfactory — incomplete fill, pattern unrecognizable or absent"],
    ],
  },
];

const FILL_PATTERNS    = ["Rectilinear / Retilíneo","Triangular","Gyroid / Giroide","Honeycomb / Hexágono","Grid / Grade","Cubic / Cúbico"];
const FILL_PERCENTAGES = ["0%","20%","40%","60%","80%","100%"];
const objParams  = PARAMS.filter(p => p.type === "objective");
const qualParams = PARAMS.filter(p => p.type === "qualitative");

// ── Recommendations — concise format: short sentence + bullets ────────────────
function getRecommendations(paramKey, score, info, lang) {
  if (score === null || score >= 4) return null;
  const pt = lang === "pt";
  const T  = (en, ptStr) => pt ? ptStr : en;

  const speed   = parseFloat(info?.speed);
  const flow    = parseFloat(info?.flowRate);
  const pattern = (info?.pattern || "").toLowerCase();
  const fillPct = parseInt(info?.fillPct || "0");

  const hasSpeed   = !isNaN(speed);
  const hasFlow    = !isNaN(flow);
  const isHighSpeed = hasSpeed && speed > 30;
  const isHighFlow  = hasFlow  && flow > 110;
  const isLowFlow   = hasFlow  && flow < 90;
  const isGyroid    = pattern.includes("giro") || pattern.includes("gyroid");
  const isConc      = pattern.includes("conc");
  const isHighFill  = !isNaN(fillPct) && fillPct >= 80;
  const isLowFill   = !isNaN(fillPct) && fillPct <= 20;

  // Bullet helper
  const B = (...items) => items.filter(Boolean).map(s => `• ${s}`).join("\n");

  const recs = {

    // ── Dimensional Fidelity ────────────────────────────────────────────────
    dimensionalFidelity: {
      1: T(
        `Fidelity below 61% — critical deviation. Check printing parameters and nozzle condition.\n`
        + B(
          hasSpeed && hasFlow ? `Current: ${speed} mm/s / ${flow}% flow — try 10–15 mm/s with 100–105% flow for best results` : `Reduce speed to 10–15 mm/s and set flow to 100–105%`,
          isHighSpeed ? `High speed (${speed} mm/s) is a primary cause of dimensional loss — reduce significantly` : null,
          isLowFlow   ? `Low flow (${flow}%) leads to insufficient material deposition — increase to 100–105%` : null,
          `Verify nozzle diameter matches the model dimensions`,
          `Check for partial nozzle clogging — clean between samples`,
          `Account for material spread (die swell) when designing the model`
        ),
        `Fidelidade abaixo de 61% — desvio crítico. Verifique os parâmetros de impressão e o bico.\n`
        + B(
          hasSpeed && hasFlow ? `Atual: ${speed} mm/s / ${flow}% fluxo — tente 10–15 mm/s com 100–105% de fluxo para melhores resultados` : `Reduza a velocidade para 10–15 mm/s e ajuste o fluxo para 100–105%`,
          isHighSpeed ? `Velocidade alta (${speed} mm/s) é causa primária da perda dimensional — reduza significativamente` : null,
          isLowFlow   ? `Fluxo baixo (${flow}%) resulta em deposição insuficiente — aumente para 100–105%` : null,
          `Verifique se o diâmetro do bico corresponde às dimensões do modelo`,
          `Cheque obstrução parcial do bico — limpe entre amostras`,
          `Considere o espalhamento do material (die swell) ao projetar o modelo`
        )
      ),
      2: T(
        `Fidelity 61–70% — significant deviation.\n`
        + B(
          isHighSpeed ? `Reduce speed (currently ${speed} mm/s) to ≤ 20 mm/s — higher speeds negatively affect precision` : `Keep speed at 10–20 mm/s for better dimensional control`,
          isLowFlow || isHighFlow ? `Flow (${flow}%) is outside the 90–110% recommended range — adjust to 100–105%` : `Confirm flow is set to 100–105%`,
          `Verify layer height ≈ nozzle diameter for proper deposition`,
          `Ensure model file dimensions are correct before printing`
        ),
        `Fidelidade 61–70% — desvio significativo.\n`
        + B(
          isHighSpeed ? `Reduza a velocidade (atual: ${speed} mm/s) para ≤ 20 mm/s — velocidades altas afetam negativamente a precisão` : `Mantenha a velocidade entre 10–20 mm/s para melhor controle dimensional`,
          isLowFlow || isHighFlow ? `Fluxo (${flow}%) fora da faixa recomendada de 90–110% — ajuste para 100–105%` : `Confirme se o fluxo está em 100–105%`,
          `Verifique se a altura de camada ≈ diâmetro do bico para deposição adequada`,
          `Certifique-se de que as dimensões do arquivo do modelo estão corretas`
        )
      ),
      3: T(
        `Fidelity 71–80% — acceptable, but improvable.\n`
        + B(
          hasFlow ? `Fine-tune flow by ±2–3% from current ${flow}% to optimize material deposition` : `Fine-tune flow rate by ±2–3% to optimize deposition`,
          hasSpeed && speed > 20 ? `Consider reducing speed slightly (currently ${speed} mm/s) for better accuracy` : null,
          `For higher-viscosity materials, increase flow slightly to 105–110% to compensate resistance`,
          `Re-measure printed dimensions across X, Y, Z axes to identify which axis deviates most`
        ),
        `Fidelidade 71–80% — aceitável, mas pode melhorar.\n`
        + B(
          hasFlow ? `Ajuste fino do fluxo em ±2–3% a partir do atual de ${flow}% para otimizar a deposição` : `Ajuste fino da taxa de fluxo em ±2–3% para otimizar a deposição`,
          hasSpeed && speed > 20 ? `Considere reduzir levemente a velocidade (atual: ${speed} mm/s) para maior precisão` : null,
          `Para materiais de maior viscosidade, aumente levemente o fluxo para 105–110% para compensar a resistência`,
          `Remeça as dimensões impressas nos eixos X, Y, Z para identificar qual eixo desvia mais`
        )
      ),
    },

    // ── Layer Adhesion ──────────────────────────────────────────────────────
    layerAdhesion: {
      1: T(
        `Severe delamination — layers not bonding. Likely structural or formulation issue.\n`
        + B(
          `Check layer height: it should be approximately equal to the nozzle diameter — too high means no contact between layers`,
          `Ensure material temperature is uniform along the syringe — cold spots reduce bonding`,
          isHighSpeed ? `Reduce speed (${speed} mm/s) to ≤ 15 mm/s to allow more contact time between layers` : null,
          `If using protein isolate without stabilizer, add 1–3% starch or hydrocolloid (e.g., xanthan gum) to improve gel cohesion`,
          `Avoid printing pauses that allow the top layer to dry before the next layer is deposited`
        ),
        `Delaminação severa — camadas não estão aderindo. Provavelmente problema estrutural ou de formulação.\n`
        + B(
          `Verifique a altura de camada: deve ser aproximadamente igual ao diâmetro do bico — muito alta significa sem contato entre camadas`,
          `Certifique-se de que a temperatura do material é uniforme ao longo da seringa — pontos frios reduzem a adesão`,
          isHighSpeed ? `Reduza a velocidade (${speed} mm/s) para ≤ 15 mm/s para permitir mais tempo de contato entre camadas` : null,
          `Se usar proteína isolada sem estabilizador, adicione 1–3% de amido ou hidrocoloide (ex.: goma xantana) para melhorar a coesão do gel`,
          `Evite pausas na impressão que permitam que a camada superior seque antes da deposição da próxima camada`
        )
      ),
      2: T(
        `Weak adhesion — frequent gaps between layers.\n`
        + B(
          `Adjust layer height: if below nozzle diameter, the nozzle pushes into previous layer causing distortion; if above, material loses contact`,
          isLowFlow ? `Increase flow (currently ${flow}%) to 100–105% — insufficient flow reduces inter-layer material fusion` : null,
          `Check material consistency: protein-only formulations tend to have poor self-adhesion — consider adding a binder`,
          `Maintain consistent material temperature throughout the print — use insulation around the syringe if needed`
        ),
        `Adesão fraca — lacunas frequentes entre camadas.\n`
        + B(
          `Ajuste a altura de camada: se abaixo do diâmetro do bico, o bico empurra para dentro da camada anterior causando distorção; se acima, o material perde contato`,
          isLowFlow ? `Aumente o fluxo (atual: ${flow}%) para 100–105% — fluxo insuficiente reduz a fusão de material entre camadas` : null,
          `Verifique a consistência do material: formulações só com proteína tendem a ter baixa auto-adesão — considere adicionar um ligante`,
          `Mantenha temperatura consistente do material ao longo da impressão — use isolamento ao redor da seringa se necessário`
        )
      ),
      3: T(
        `Acceptable adhesion with occasional irregularities.\n`
        + B(
          `Reduce layer height by 5–10% below nozzle diameter to slightly increase inter-layer overlap`,
          `Minimize any pauses between layers — even short stops allow the surface to form a dry skin`,
          `Verify material temperature is uniform from the top to the bottom of the syringe`,
          `If irregularities concentrate at a specific layer height, check for uneven plunger pressure`
        ),
        `Adesão aceitável com irregularidades ocasionais.\n`
        + B(
          `Reduza a altura de camada em 5–10% abaixo do diâmetro do bico para aumentar levemente a sobreposição entre camadas`,
          `Minimize pausas entre camadas — mesmo paradas curtas permitem que a superfície forme película seca`,
          `Verifique se a temperatura do material é uniforme do topo ao fundo da seringa`,
          `Se as irregularidades se concentram em uma altura de camada específica, verifique a pressão irregular do êmbolo`
        )
      ),
    },

    // ── Extrusion Consistency ───────────────────────────────────────────────
    extrusionConsistency: {
      1: T(
        `Severely irregular extrusion — lumps, dripping or continuous interruptions observed.\n`
        + B(
          `Degas the material before loading: centrifuge or stir vigorously to remove air bubbles`,
          `Increase retraction distance and speed in the slicer to reduce material blobs at start/stop points`,
          isHighFlow ? `Reduce flow (currently ${flow}%) to 100–105% — excess pressure causes irregular bursts` : null,
          `If viscosity is too high: use a larger nozzle or reduce material concentration`,
          `If viscosity is too low (material drips freely): increase concentration or add a thickening agent`,
          `Clean the nozzle thoroughly — partial clogging causes irregular pressure surges`
        ),
        `Extrusão severamente irregular — grumos, pingos ou interrupções contínuas observados.\n`
        + B(
          `Degaseifique o material antes de carregar: centrifugue ou agite vigorosamente para remover bolhas de ar`,
          `Aumente a distância e a velocidade de retração no slicer para reduzir excessos de material nos pontos de início/parada`,
          isHighFlow ? `Reduza o fluxo (atual: ${flow}%) para 100–105% — pressão excessiva causa surtos irregulares` : null,
          `Se a viscosidade for muito alta: use um bico maior ou reduza a concentração do material`,
          `Se a viscosidade for muito baixa (material goteja livremente): aumente a concentração ou adicione espessante`,
          `Limpe o bico completamente — obstrução parcial causa variações de pressão irregulares`
        )
      ),
      2: T(
        `Frequent defects — dripping, dragging or irregular flow at path changes.\n`
        + B(
          `Fine-tune retraction settings: increase retraction speed by 10–20% to reduce material blobs at direction changes`,
          `Homogenize the material thoroughly and filter out any coarse particles before loading`,
          isHighFlow ? `Flow (${flow}%) is above recommended — try reducing to 100–105%` : null,
          `Check temperature uniformity along the syringe — viscosity gradients cause inconsistent filament diameter`,
          `Monitor flow especially at curves — deceleration at corners causes local over-extrusion`
        ),
        `Defeitos frequentes — pingos, arraste ou fluxo irregular nas mudanças de direção.\n`
        + B(
          `Ajuste fino da retração: aumente a velocidade de retração em 10–20% para reduzir excessos de material nas mudanças de direção`,
          `Homogeneize bem o material e filtre partículas grossas antes de carregar`,
          isHighFlow ? `Fluxo (${flow}%) acima do recomendado — tente reduzir para 100–105%` : null,
          `Verifique a uniformidade de temperatura ao longo da seringa — gradientes de viscosidade causam diâmetro variável do filamento`,
          `Monitore o fluxo especialmente nas curvas — a desaceleração nas esquinas causa sobre-extrusão local`
        )
      ),
      3: T(
        `Some occasional inconsistencies — generally acceptable flow.\n`
        + B(
          `Fine-tune retraction: minor blobs at path changes can be minimized with small increases in retraction distance (0.5–1 mm)`,
          `Ensure the syringe plunger is applying even pressure — tighten or replace if contact is uneven`,
          `Reduce print speed at path start/stop points to allow the material to stabilize before moving`,
          `If lumps appear at specific locations, check if the nozzle path has sharp angle changes that accumulate material`
        ),
        `Algumas inconsistências ocasionais — fluxo geralmente aceitável.\n`
        + B(
          `Ajuste fino da retração: pequenos excessos nas mudanças de caminho podem ser minimizados com pequenos aumentos na distância de retração (0,5–1 mm)`,
          `Certifique-se de que o êmbolo da seringa aplica pressão uniforme — aperte ou substitua se o contato for irregular`,
          `Reduza a velocidade de impressão nos pontos de início/parada do caminho para permitir que o material se estabilize antes de mover`,
          `Se os grumos aparecem em locais específicos, verifique se o caminho do bico tem mudanças de ângulo abruptas que acumulam material`
        )
      ),
    },

    // ── Structural Quality ──────────────────────────────────────────────────
    structuralQuality: {
      1: T(
        `Severe structural collapse — shape not retained after printing.\n`
        + B(
          isGyroid && isHighFill ? `Gyroid at ${fillPct}% fill is causing collapse — switch to Triangular or Rectilinear pattern at 40–60% fill` : `Rectilinear or Honeycomb patterns provide better internal support for gel materials than Gyroid or Concentric`,
          isHighFill ? `Reduce fill percentage (currently ${fillPct}%) to 40–60% — high fill increases internal weight that gels cannot support` : null,
          `If using protein isolate without stabilizer, add 1–5% starch or hydrocolloid — pure protein gels have low elastic recovery`,
          `Refrigerate or cool the sample immediately after printing to help the gel network set`,
          `Verify that the gel was fully prepared (properly gelatinized or hydrated) before printing`
        ),
        `Colapso estrutural severo — forma não é mantida após a impressão.\n`
        + B(
          isGyroid && isHighFill ? `Giroide com ${fillPct}% de preenchimento está causando colapso — mude para padrão Triangular ou Retilíneo com 40–60% de preenchimento` : `Padrões Retilíneo ou Honeycomb fornecem melhor suporte interno para materiais de gel do que Giroide ou Concêntrico`,
          isHighFill ? `Reduza o percentual de preenchimento (atual: ${fillPct}%) para 40–60% — preenchimento alto aumenta o peso interno que os géis não conseguem suportar` : null,
          `Se usar proteína isolada sem estabilizador, adicione 1–5% de amido ou hidrocoloide — géis de proteína pura têm baixa recuperação elástica`,
          `Refrigere ou resfrie a amostra imediatamente após a impressão para ajudar a rede de gel a se estabilizar`,
          `Verifique se o gel foi completamente preparado (gelatinizado ou hidratado adequadamente) antes da impressão`
        )
      ),
      2: T(
        `Significant post-print deformation.\n`
        + B(
          isGyroid ? `Gyroid pattern tends to collapse in food gels — consider switching to Triangular or Rectilinear` : `Verify that the fill pattern provides vertical support walls that connect infill to the outer shell`,
          `Increase fill percentage by 10–20% to add more internal support mass`,
          `Refrigerate immediately after printing — delaying cooling allows gravity to deform the structure`,
          `If deformation is consistent across samples, review gel formulation: increase gelling agent concentration`,
          `For protein-starch composites: ensure complete gelatinization before printing`
        ),
        `Deformação significativa pós-impressão.\n`
        + B(
          isGyroid ? `Padrão Giroide tende a colapsar em géis alimentícios — considere mudar para Triangular ou Retilíneo` : `Verifique se o padrão de preenchimento fornece paredes de suporte vertical que conectam o preenchimento à casca externa`,
          `Aumente o percentual de preenchimento em 10–20% para adicionar mais massa de suporte interno`,
          `Refrigere imediatamente após a impressão — atrasar o resfriamento permite que a gravidade deforme a estrutura`,
          `Se a deformação for consistente entre amostras, revise a formulação do gel: aumente a concentração do agente gelificante`,
          `Para compósitos proteína-amido: certifique-se da gelatinização completa antes da impressão`
        )
      ),
      3: T(
        `Reasonable structure with visible deformation in some areas.\n`
        + B(
          `Increase fill percentage by 10–20% to strengthen the internal support structure`,
          `Check gel consistency: heterogeneous gels have localized weak points — ensure uniform mixing`,
          `Minimize time between printing and cooling — even 1–2 minutes of delay can cause measurable deformation`,
          `If deformation occurs in specific regions, check if those areas have lower fill density or weaker shell connections`
        ),
        `Estrutura razoável com deformação visível em algumas regiões.\n`
        + B(
          `Aumente o percentual de preenchimento em 10–20% para fortalecer a estrutura de suporte interno`,
          `Verifique a consistência do gel: géis heterogêneos têm pontos fracos localizados — garanta mistura uniforme`,
          `Minimize o tempo entre a impressão e o resfriamento — mesmo 1–2 minutos de atraso podem causar deformação mensurável`,
          `Se a deformação ocorre em regiões específicas, verifique se essas áreas têm menor densidade de preenchimento ou conexões de casca mais fracas`
        )
      ),
    },

    // ── Surface Finish ──────────────────────────────────────────────────────
    surfaceFinish: {
      1: T(
        `Very rough surface with major visible defects.\n`
        + B(
          isHighSpeed ? `Reduce speed (currently ${speed} mm/s) to ≤ 15 mm/s — high speed causes drag marks and uneven deposition` : `Keep print speed at 10–15 mm/s for better surface quality`,
          `Clean the nozzle — partial clogging creates irregular pressure and surface striations`,
          `Check material viscosity: too high → rough surface and dragging; too low → material spreads and edges lose definition`,
          `Verify first layer adhesion to the base — poor adhesion creates surface irregularities throughout the print`,
          `Reduce retraction distance if material strings are visible between non-printing moves`
        ),
        `Superfície muito rugosa com defeitos maiores visíveis.\n`
        + B(
          isHighSpeed ? `Reduza a velocidade (atual: ${speed} mm/s) para ≤ 15 mm/s — velocidade alta causa marcas de arraste e deposição desigual` : `Mantenha a velocidade de impressão em 10–15 mm/s para melhor qualidade superficial`,
          `Limpe o bico — obstrução parcial cria pressão irregular e estrias na superfície`,
          `Verifique a viscosidade do material: muito alta → superfície rugosa e arraste; muito baixa → material se espalha e bordas perdem definição`,
          `Verifique a adesão da primeira camada à base — má adesão cria irregularidades superficiais ao longo de toda a impressão`,
          `Reduza a distância de retração se fios de material aparecerem entre movimentos sem extrusão`
        )
      ),
      2: T(
        `Rough surface with poorly defined edges.\n`
        + B(
          isHighFlow ? `Reduce flow (currently ${flow}%) to 100–105% — excess material causes surface bulging and roughness` : null,
          `Reduce outer perimeter speed by 20–30% relative to infill speed for a smoother external finish`,
          `Check retraction settings: insufficient retraction leaves material strings on the surface`,
          `Ensure consistent nozzle temperature throughout the print — cold spots cause uneven extrusion and surface marks`
        ),
        `Superfície rugosa com bordas mal definidas.\n`
        + B(
          isHighFlow ? `Reduza o fluxo (atual: ${flow}%) para 100–105% — excesso de material causa abaulamento e rugosidade superficial` : null,
          `Reduza a velocidade do perímetro externo em 20–30% em relação à velocidade de preenchimento para acabamento externo mais liso`,
          `Verifique as configurações de retração: retração insuficiente deixa fios de material na superfície`,
          `Garanta temperatura constante do bico ao longo da impressão — pontos frios causam extrusão irregular e marcas na superfície`
        )
      ),
      3: T(
        `Acceptable surface with minor imperfections.\n`
        + B(
          `Reduce outer perimeter speed by 10–15% for smoother surface — slower movement gives material more time to settle`,
          `Minimize pauses between layers that allow the surface to partially dry before the next layer`,
          `If rough patches appear at specific locations, check for nozzle path sharp turns that accumulate material`,
          `Verify material temperature uniformity — cold spots in the syringe create local viscosity variation and surface inconsistencies`
        ),
        `Superfície aceitável com pequenas imperfeições.\n`
        + B(
          `Reduza a velocidade do perímetro externo em 10–15% para superfície mais lisa — movimento mais lento dá ao material mais tempo para assentar`,
          `Minimize pausas entre camadas que permitem que a superfície seque parcialmente antes da próxima camada`,
          `Se manchas rugosas aparecem em locais específicos, verifique curvas abruptas no caminho do bico que acumulam material`,
          `Verifique a uniformidade da temperatura do material — pontos frios na seringa criam variação local de viscosidade e inconsistências na superfície`
        )
      ),
    },

    // ── Fill Uniformity ─────────────────────────────────────────────────────
    fillUniformity: {
      1: T(
        `Incomplete or unrecognizable fill pattern.\n`
        + B(
          isLowFill ? `Fill percentage (${fillPct}%) is too low for gel materials — increase to at least 40% so filaments can bridge between shell walls` : null,
          isGyroid || isConc ? `Complex pattern (Gyroid/Concentric) requires high material elasticity — switch to Rectilinear or Honeycomb for more consistent results` : null,
          `Degas material before printing: centrifuge or stir to remove air pockets that cause sudden flow interruptions`,
          `Verify that extrusion pressure is sufficient for the selected pattern — complex patterns require more consistent pressure`,
          `Check that the nozzle path in the slicer matches the expected pattern — re-slice and inspect if needed`
        ),
        `Padrão de preenchimento incompleto ou irreconhecível.\n`
        + B(
          isLowFill ? `Percentual de preenchimento (${fillPct}%) muito baixo para materiais de gel — aumente para pelo menos 40% para que os filamentos possam vencer o vão entre as paredes da casca` : null,
          isGyroid || isConc ? `Padrão complexo (Giroide/Concêntrico) exige alta elasticidade do material — mude para Retilíneo ou Honeycomb para resultados mais consistentes` : null,
          `Degaseifique o material antes de imprimir: centrifugue ou agite para remover bolsas de ar que causam interrupções súbitas no fluxo`,
          `Verifique se a pressão de extrusão é suficiente para o padrão selecionado — padrões complexos exigem pressão mais consistente`,
          `Confirme que o caminho do bico no slicer corresponde ao padrão esperado — refatie e inspecione se necessário`
        )
      ),
      2: T(
        `Frequent voids or noticeable variation between replicates.\n`
        + B(
          `Standardize syringe loading: always use the same volume and degassing method before each print`,
          isHighFill ? `Reduce fill (currently ${fillPct}%) to 60–70% — very high fill can compress the pattern and cause it to lose definition` : null,
          `Switch to a simpler pattern (Rectilinear or Honeycomb) if current pattern shows frequent breaks — simpler geometry is more reproducible with gel materials`,
          `Compare samples side by side immediately after printing to identify if variation is systematic or random`,
          `If variation is consistent across prints, check whether the material preparation protocol is identical for all replicates`
        ),
        `Vazios frequentes ou variação perceptível entre replicatas.\n`
        + B(
          `Padronize o carregamento da seringa: sempre use o mesmo volume e método de degaseificação antes de cada impressão`,
          isHighFill ? `Reduza o preenchimento (atual: ${fillPct}%) para 60–70% — preenchimento muito alto pode comprimir o padrão e fazer com que ele perca a definição` : null,
          `Mude para um padrão mais simples (Retilíneo ou Honeycomb) se o padrão atual apresentar quebras frequentes — geometria mais simples é mais reprodutível com materiais de gel`,
          `Compare as amostras lado a lado imediatamente após a impressão para identificar se a variação é sistemática ou aleatória`,
          `Se a variação for consistente entre impressões, verifique se o protocolo de preparo do material é idêntico para todas as replicatas`
        )
      ),
      3: T(
        `Reasonable fill with some inter-sample variation.\n`
        + B(
          `Standardize all steps of material preparation — small differences in mixing time, temperature, or rest time affect viscosity and pattern reproducibility`,
          `Take photos of each replicate immediately after printing to document pattern consistency over time`,
          `If using high-fiber materials (e.g., açaí flour), measure dimensions at 0 min and 30 min post-print — fiber absorbs water and can cause the pattern to expand or distort`,
          `For Spirulina-based gels: keep fill at 40–60% to balance structural stability with moisture retention`
        ),
        `Preenchimento razoável com alguma variação entre amostras.\n`
        + B(
          `Padronize todas as etapas do preparo do material — pequenas diferenças no tempo de mistura, temperatura ou tempo de repouso afetam a viscosidade e a reprodutibilidade do padrão`,
          `Fotografe cada replicata imediatamente após a impressão para documentar a consistência do padrão ao longo do tempo`,
          `Se usar materiais de alta fibra (ex.: farinha de açaí), meça as dimensões em 0 e 30 min após a impressão — a fibra absorve água e pode causar expansão ou distorção do padrão`,
          `Para géis à base de Spirulina: mantenha o preenchimento em 40–60% para equilibrar estabilidade estrutural e retenção de umidade`
        )
      ),
    },
  };

  return recs[paramKey]?.[score] ?? null;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(rows, lang) {
  // Parameter short labels for CSV header
  const paramLabels = {
    dimensionalFidelity:  lang==="pt" ? "Fid.Dimensional"  : "Dim.Fidelity",
    layerAdhesion:        lang==="pt" ? "Ades.Camadas"      : "LayerAdhesion",
    extrusionConsistency: lang==="pt" ? "Consist.Extrusão"  : "ExtrusionConsist",
    structuralQuality:    lang==="pt" ? "Qual.Estrutural"   : "StructQuality",
    surfaceFinish:        lang==="pt" ? "Acab.Superficial"  : "SurfaceFinish",
    fillUniformity:       lang==="pt" ? "Unif.Preenchimento": "FillUniformity",
  };
  const paramKeys = Object.keys(paramLabels);

  const h = lang === "pt"
    ? ["Código","Data","Formulação","Padrão","Preenchimento","Velocidade","Fluxo","Bico","Temp",
       ...paramKeys.map(k=>paramLabels[k]),
       "3DFPQ","Qualidade"]
    : ["Code","Date","Formulation","Pattern","Fill","Speed","Flow","Nozzle","Temp",
       ...paramKeys.map(k=>paramLabels[k]),
       "3DFPQ","Quality"];

  const data = rows.map(e => {
    const ps = e.paramScores || {};
    return [
      e.code, e.date, e.ingredients||"", e.pattern, e.fillPct,
      e.speed||"", e.flowRate||"", e.nozzle||"", e.temp||"",
      ...paramKeys.map(k => ps[k] != null ? ps[k] : "—"),
      e.score.toFixed(3), lang==="pt" ? e.qualityPt : e.qualityEn,
    ];
  });
  const csv = "\uFEFF" + [h,...data].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  const a = document.createElement("a"); a.href=url; a.download="3DFPQ-results.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Photo thumbnail helper ────────────────────────────────────────────────────
// Uses canvas.toDataURL directly — toBlob is unreliable in Electron with contextIsolation
async function createThumbnail(file, maxWidth=600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        try {
          const ratio = img.height > 0 ? img.width / img.height : 1;
          const w = Math.min(img.width, maxWidth);
          const h = Math.round(w / ratio);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          // toDataURL works synchronously and reliably in Electron
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve(dataUrl);
        } catch(err) { reject(err); }
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── PDF generation ────────────────────────────────────────────────────────────
async function generatePDF({entries,lang}) {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const T = (en,pt) => lang==="pt"?pt:en;
  const pageW=210, margin=18, contentW=pageW-margin*2;
  let y=0, pageNum=1;
  const addPage = () => { doc.addPage(); y=20; };
  const checkY  = (n=10) => { if(y+n>272) addPage(); };
  const drawHeader = () => {
    doc.setFillColor(219,234,254); doc.rect(0,0,pageW,22,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(30,58,138);
    doc.text("3D Food Printing Quality — 3DFPQ",margin,10);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,116,139);
    doc.text(T("Quality Evaluation Report","Relatório de Avaliação de Qualidade"),margin,16);
    doc.text(`${T("Page","Pág.")} ${pageNum}`,pageW-margin,16,{align:"right"});
    doc.text("LOPES, L.C.; COSTA, J.A.V.; ROSA, G.M. · FURG · Lei 9.609/1998",margin,20.5);
    y=28;
  };
  drawHeader();
  doc.setDrawColor(191,219,254); doc.line(margin,y-2,pageW-margin,y-2); y+=2;

  for(let idx=0;idx<entries.length;idx++) {
    const entry=entries[idx];
    if(idx>0){addPage();pageNum++;drawHeader();doc.setDrawColor(191,219,254);doc.line(margin,y-2,pageW-margin,y-2);y+=2;}
    const q=getQuality(entry.score);

    // sample info block — photo placed BELOW text, not overlapping
    const isValidBase64Img = entry.photoThumb &&
      typeof entry.photoThumb === "string" &&
      entry.photoThumb.startsWith("data:image");

    // Block height: 28mm text area + 32mm photo area if present
    const textBlockH = 28;
    const photoBlockH = 34;
    const totalBlockH = isValidBase64Img ? textBlockH + photoBlockH : textBlockH;

    doc.setFillColor(248,250,252);
    doc.roundedRect(margin, y, contentW, totalBlockH, 2, 2, "F");

    // text content
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(30,58,138);
    doc.text(entry.code||"Sample", margin+4, y+7);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(55,65,81);
    const c2 = margin + contentW/2;
    doc.text(`${T("Date","Data")}: ${entry.date||"—"}`, margin+4, y+13);
    doc.text(`${T("Formulation","Formulação")}: ${entry.ingredients||"—"}`, margin+4, y+18);
    doc.text(`${T("Pattern","Padrão")}: ${entry.pattern||"—"}  |  ${T("Fill","Preench.")}: ${entry.fillPct||"—"}`, margin+4, y+23);
    doc.text(`${T("Speed","Veloc.")}: ${entry.speed||"—"} mm/s  |  ${T("Flow","Fluxo")}: ${entry.flowRate||"—"}%  |  ${T("Nozzle","Bico")}: ${entry.nozzle||"—"} mm`, c2, y+13);
    doc.text(`${T("Temp","Temp")}: ${entry.temp||"—"} °C`, c2, y+18);

    // photo below text, centered, with label
    if(isValidBase64Img){
      try{
        const imgY = y + textBlockH + 2;
        const imgH = photoBlockH - 6;
        const imgW = Math.round(imgH * 1.33); // ~4:3 aspect
        const imgX = margin + (contentW - imgW) / 2;
        doc.addImage(entry.photoThumb, "JPEG", imgX, imgY, imgW, imgH, undefined, "FAST");
        doc.setFont("helvetica","italic"); doc.setFontSize(7); doc.setTextColor(156,163,175);
        doc.text(T("Sample photo","Foto da amostra"), margin+contentW/2, y+totalBlockH-1, {align:"center"});
      }catch(e){ console.warn("PDF photo skip:",e); }
    }

    y += totalBlockH + 4; checkY(10);

    // parameters table
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(30,58,138);
    doc.text(T("Quality Parameters","Parâmetros de Qualidade"),margin,y); y+=4;
    const colW=[contentW*0.42,contentW*0.12,contentW*0.12,contentW*0.15,contentW*0.19];
    const colX=[margin]; colW.forEach((w,i)=>colX.push(colX[i]+w));
    doc.setFillColor(239,246,255); doc.rect(margin,y,contentW,6,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(55,65,81);
    [T("Parameter","Parâmetro"),T("Type","Tipo"),"w",T("Score","Pont."),T("Weighted","Ponderado")]
      .forEach((h,i)=>doc.text(h,colX[i]+2,y+4.2));
    y+=6;
    PARAMS.forEach((p,pi)=>{
      checkY(7);
      // support legacy entries that stored scores differently
      const s = entry.paramScores?.[p.key] ?? null;
      const ws=s!==null?(s*p.weight).toFixed(3):"—";
      if(pi%2===0){doc.setFillColor(250,250,252);doc.rect(margin,y,contentW,6.5,"F");}
      doc.setFont("helvetica",p.type==="objective"?"bolditalic":"normal");
      doc.setFontSize(8); doc.setTextColor(55,65,81);
      doc.text(T(p.en,p.pt),colX[0]+2,y+4.2);
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
      doc.setTextColor(p.type==="objective"?30:146,64,p.type==="objective"?175:14);
      doc.text(p.type==="objective"?"obj":"qual",colX[1]+2,y+4.2);
      doc.setTextColor(55,65,81);
      doc.text(`${(p.weight*100).toFixed(0)}%`,colX[2]+2,y+4.2);
      if(s!==null){
        const rgb=s>=4?[22,163,74]:s>=3?[37,99,235]:s>=2?[217,119,6]:[220,38,38];
        doc.setFillColor(...rgb); doc.circle(colX[3]+5,y+3.2,2.8,"F");
        doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(255,255,255);
        doc.text(String(s),colX[3]+5,y+4.3,{align:"center"});
      } else {doc.setTextColor(180,180,180);doc.setFontSize(8);doc.text("—",colX[3]+5,y+4.2,{align:"center"});}
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(55,65,81);
      doc.text(ws,colX[4]+2,y+4.2);
      y+=6.5;
    });

    if(entry.expansionRate||entry.density||entry.notes){
      checkY(8); doc.setFont("helvetica","italic"); doc.setFontSize(7.5); doc.setTextColor(156,163,175);
      const parts=[];
      if(entry.expansionRate) parts.push(`${T("Exp.Rate","T.Exp.")}: ${entry.expansionRate}%`);
      if(entry.density) parts.push(`${T("Density","Dens.")}: ${entry.density} g/cm³`);
      if(entry.notes) parts.push(entry.notes);
      doc.text(T("Info: ","Info: ")+parts.join("  ·  "),margin,y+3); y+=7;
    }
    y+=2; checkY(28);

    // score box
    const qRgb=q.color==="#16a34a"?[22,163,74]:q.color==="#2563eb"?[37,99,235]:q.color==="#d97706"?[217,119,6]:[220,38,38];
    doc.setFillColor(...qRgb.map(c=>Math.round(c*0.12+243)));
    doc.roundedRect(margin,y,contentW,22,2,2,"F");
    doc.setDrawColor(...qRgb); doc.setLineWidth(0.5); doc.roundedRect(margin,y,contentW,22,2,2,"S");
    doc.setFillColor(...qRgb); doc.circle(margin+14,y+11,9,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(255,255,255);
    doc.text(entry.score.toFixed(2),margin+14,y+12.5,{align:"center"});
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...qRgb);
    doc.text(lang==="pt"?q.pt:q.en,margin+27,y+9);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(107,114,128);
    doc.text("3DFPQ = Σ(wᵢ·Sᵢ) / Σwᵢ",margin+27,y+15);
    doc.text(`1 ${T("objective","objetivo")} · 5 ${T("qualitative","qualitativos")} · Σwᵢ = 1.00`,margin+27,y+20);
    y+=28;

    // recommendations in PDF
    const lowP=PARAMS.filter(p=>(entry.paramScores?.[p.key]??5)<=3);
    if(lowP.length>0){
      checkY(12); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(30,58,138);
      doc.text(T("Recommendations","Recomendações"),margin,y); y+=5;
      lowP.forEach(p=>{
        const s=entry.paramScores?.[p.key] ?? null;
        const rec=getRecommendations(p.key,s,entry,lang);
        if(!rec) return;
        const lines=doc.splitTextToSize(rec,contentW-6);
        const boxH=Math.max(8,lines.length*4.5+6);
        checkY(boxH+3);
        doc.setFillColor(255,249,240); doc.roundedRect(margin,y,contentW,boxH,1,1,"F");
        doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(146,64,14);
        doc.text(`${T(p.en,p.pt)} (${s}/5)`,margin+2,y+4.5);
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(55,65,81);
        doc.text(lines,margin+3,y+8.5);
        y+=boxH+3;
      });
    }
    y+=4;
  }

  checkY(8); doc.setDrawColor(191,219,254); doc.line(margin,y,pageW-margin,y); y+=4;
  doc.setFont("helvetica","italic"); doc.setFontSize(7.5); doc.setTextColor(156,163,175);
  doc.text(`3DFPQ v3.0 · LOPES, L.C.; COSTA, J.A.V.; ROSA, G.M. · FURG · ${T("Registered under Brazilian Law 9.609/1998","Registrado pela Lei 9.609/1998")} · ${new Date().toLocaleDateString()}`,pageW/2,y+3,{align:"center"});
  return doc;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TypeBadge({type,moment,lang}) {
  if(type==="objective") return <span style={bdg("#dbeafe","#1e40af")}>⚗ {lang==="pt"?"OBJETIVO":"OBJECTIVE"}</span>;
  const txt=moment==="during"?(lang==="pt"?"👁 durante a impressão":"👁 during print"):(lang==="pt"?"👁 pós-impressão":"👁 post-print");
  return <span style={bdg("#fef3c7","#92400e")}>{txt}</span>;
}
const bdg=(bg,color)=>({background:bg,color,fontSize:"10px",fontWeight:"700",padding:"2px 8px",borderRadius:"999px",fontFamily:"monospace",letterSpacing:"0.04em",whiteSpace:"nowrap"});

function ScoreButtons({value,onChange}) {
  return (
    <div style={{display:"flex",gap:"6px"}}>
      {[1,2,3,4,5].map(n=>{
        const active=value===n; const col=scoreColor(n);
        return <button key={n} onClick={()=>onChange(active?null:n)} style={{width:"36px",height:"36px",borderRadius:"50%",border:active?`2px solid ${col}`:"1.5px solid #d1d5db",background:active?col:"#f9fafb",color:active?"#fff":"#9ca3af",fontWeight:"700",fontSize:"14px",cursor:"pointer",transition:"all 0.12s",fontFamily:"inherit",boxShadow:active?`0 0 0 3px ${col}28`:"none"}}>{n}</button>;
      })}
    </div>
  );
}

function MiniBar({score,weight}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
      <div style={{flex:1,height:"5px",background:"#e5e7eb",borderRadius:"3px",overflow:"hidden"}}>
        <div style={{width:`${(score/5)*100}%`,height:"100%",background:scoreColor(score),borderRadius:"3px",transition:"width 0.4s"}}/>
      </div>
      <span style={{fontSize:"11px",color:"#6b7280",fontFamily:"monospace",minWidth:"38px",textAlign:"right"}}>{(score*weight).toFixed(3)}</span>
    </div>
  );
}

function RadialScore({score,color,size=104}) {
  const r=size/2-9; const circ=2*Math.PI*r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={circ*(1-score/5)} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.5s cubic-bezier(.4,0,.2,1)"}}/>
      <text x={size/2} y={size/2+8} textAnchor="middle" fontSize="22" fontWeight="800" fill={color} fontFamily="'Segoe UI',Arial,sans-serif">{score.toFixed(2)}</text>
    </svg>
  );
}

function PDFModal({onClose,onExport,hasCurrent,historyCount,lang}) {
  const T=(en,pt)=>lang==="pt"?pt:en;
  const [choice,setChoice]=useState(hasCurrent?"current":"all");
  const opts=[
    hasCurrent&&["current",T("Current evaluation","Avaliação atual"),T("Exports the scores currently filled in.","Exporta as pontuações preenchidas no momento.")],
    historyCount>0&&["selected",T("Selected samples from history","Amostras selecionadas do histórico"),T("Exports only checked rows in History tab.","Exporta apenas as linhas marcadas na aba Histórico.")],
    historyCount>0&&["all",T("All history","Todo o histórico"),`${T("Exports all","Exporta todos os")} ${historyCount} ${T("saved records.","registros salvos.")}`],
  ].filter(Boolean);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#fff",borderRadius:"12px",padding:"28px 32px",width:"380px",boxShadow:"0 20px 48px rgba(0,0,0,0.18)"}}>
        <h3 style={{fontSize:"16px",fontWeight:"700",color:"#1e3a8a",marginBottom:"6px"}}>{T("Export PDF","Exportar PDF")}</h3>
        <p style={{fontSize:"13px",color:"#6b7280",marginBottom:"20px"}}>{T("Choose what to include in the report:","Escolha o que incluir no relatório:")}</p>
        {opts.map(([val,label,desc])=>(
          <div key={val} onClick={()=>setChoice(val)} style={{padding:"12px 14px",borderRadius:"8px",border:`2px solid ${choice===val?"#2563eb":"#e5e7eb"}`,background:choice===val?"#eff6ff":"#fafafa",cursor:"pointer",marginBottom:"10px",transition:"all 0.12s"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <div style={{width:"18px",height:"18px",borderRadius:"50%",border:`2px solid ${choice===val?"#2563eb":"#d1d5db"}`,background:choice===val?"#2563eb":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {choice===val&&<div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <div>
                <div style={{fontWeight:"700",fontSize:"13px",color:"#111827"}}>{label}</div>
                <div style={{fontSize:"12px",color:"#6b7280",marginTop:"2px"}}>{desc}</div>
              </div>
            </div>
          </div>
        ))}
        <div style={{display:"flex",gap:"10px",marginTop:"20px"}}>
          <button onClick={onClose} style={{flex:1,padding:"10px",borderRadius:"7px",border:"1px solid #e5e7eb",background:"#f9fafb",cursor:"pointer",fontFamily:"inherit",fontWeight:"600",fontSize:"13px"}}>{T("Cancel","Cancelar")}</button>
          <button onClick={()=>onExport(choice)} style={{flex:1,padding:"10px",borderRadius:"7px",border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontWeight:"700",fontSize:"13px"}}>{T("Generate PDF","Gerar PDF")}</button>
        </div>
      </div>
    </div>
  );
}

function Toast({msg,show}) {
  if(!show) return null;
  return <div style={{position:"fixed",right:"20px",bottom:"24px",background:"rgba(17,24,39,0.95)",color:"#fff",padding:"10px 16px",borderRadius:"8px",boxShadow:"0 6px 18px rgba(0,0,0,0.2)",zIndex:9998,fontSize:"13px",maxWidth:"420px",lineHeight:1.6}}>{msg}</div>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [lang,setLang]=useState("en");
  const T=(en,pt)=>lang==="pt"?pt:en;
  const PRIMARY="#2563eb",SUCCESS="#16a34a",WARN="#f97316";

  const [info,setInfo]=useState({
    sampleCode:"",date:new Date().toISOString().split("T")[0],
    ingredients:"",speed:"10",flowRate:"100",nozzle:"1.2",temp:"25",
    pattern:"Rectilinear / Retilíneo",fillPct:"40%",
    expansionRate:"",density:"",notes:"",
  });

  const [photoFile,   setPhotoFile]   = useState(null);
  const [photoPreview,setPhotoPreview]= useState(null);
  const [photoThumb,  setPhotoThumb]  = useState(null);

  const handlePhotoChange = (e) => {
    const f = e?.target?.files?.[0] ?? null;
    if(!f){ setPhotoFile(null); setPhotoPreview(null); setPhotoThumb(null); return; }

    // Validate format — only JPG and PNG accepted
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if(!allowed.includes(f.type)){
      showToast(T(
        `Invalid format: "${f.type || f.name.split(".").pop()}". Only JPG and PNG are accepted.`,
        `Formato inválido: "${f.type || f.name.split(".").pop()}". Apenas JPG e PNG são aceitos.`
      ), 5000);
      // reset input value so user can reselect
      e.target.value = "";
      return;
    }

    setPhotoFile(f);
    // Use FileReader directly — canvas is unreliable in Electron with contextIsolation
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPhotoPreview(dataUrl);
      setPhotoThumb(dataUrl);
    };
    reader.onerror = () => showToast(T("Error reading photo file.","Erro ao ler o arquivo de foto."), 4000);
    reader.readAsDataURL(f);
  };

  // no blob URLs used — base64 previews don't need revocation

  const initVals=()=>Object.fromEntries(PARAMS.map(p=>[p.key,{raw:"",score:null}]));
  const [vals,setVals]               =useState(initVals);
  const [history,setHistory]         =useState([]);
  const [selectedRows,setSelectedRows]=useState(new Set());
  const [tab,setTab]                 =useState("eval");
  const [showPDF,setShowPDF]         =useState(false);
  const [toast,setToast]             =useState({msg:"",show:false});
  const histRef=useRef(null);

  const showToast=(msg,ms=3500)=>{setToast({msg,show:true});setTimeout(()=>setToast({msg:"",show:false}),ms);};

  const setObjRaw=useCallback((key,raw,converter)=>setVals(prev=>({...prev,[key]:{raw,score:converter(raw)}})),[]);
  const setQual  =useCallback((key,score)=>setVals(prev=>({...prev,[key]:{raw:"",score}})),[]);

  const allScores =PARAMS.map(p=>vals[p.key].score);
  const filled    =allScores.filter(s=>s!==null).length;
  const complete  =filled===PARAMS.length;
  const totalW    =PARAMS.reduce((a,p)=>a+p.weight,0);
  const finalScore=complete?PARAMS.reduce((acc,p)=>acc+vals[p.key].score*p.weight,0)/totalW:null;
  const quality   =finalScore!==null?getQuality(finalScore):null;
  const recParams =PARAMS.filter(p=>vals[p.key].score!==null&&vals[p.key].score<=3);

  useEffect(()=>{
    if(window.electron?.loadData){
      window.electron.loadData().then(d=>{
        if(d?.history?.length) setHistory(d.history);
        if(d?.language) setLang(d.language);
      }).catch(console.error);
    }
  },[]);

  const buildCurrentEntry=()=>{
    const q=getQuality(finalScore);
    return {id:Date.now(),code:info.sampleCode||"S-current",date:info.date,ingredients:info.ingredients,
      pattern:info.pattern,fillPct:info.fillPct,speed:info.speed,flowRate:info.flowRate,
      nozzle:info.nozzle,temp:info.temp,expansionRate:info.expansionRate,density:info.density,
      notes:info.notes,photoThumb,score:finalScore,qualityEn:q.en,qualityPt:q.pt,
      paramScores:Object.fromEntries(PARAMS.map(p=>[p.key,vals[p.key].score]))};
  };

  const saveEntry=async()=>{
    if(!complete) return;
    let savedThumb=photoThumb;
    if(photoFile&&window.electron?.saveToUserData){
      try{
        const ts=new Date().toISOString().replace(/[:.]/g,"-");
        const name=`impressao-${info.sampleCode||"amostra"}-${ts}-thumb.jpg`;
        const buf=await(await fetch(photoThumb)).arrayBuffer();
        const res=await window.electron.saveToUserData({filename:name,content:new Uint8Array(buf)});
        if(res?.success) savedThumb=`file://${res.path}`;
      }catch(e){console.warn("Photo save failed:",e);}
    }
    const entry={...buildCurrentEntry(),id:Date.now(),code:info.sampleCode||`S-${history.length+1}`,photoThumb:savedThumb};
    setHistory(prev=>{
      const next=[entry,...prev];
      if(window.electron?.saveData) window.electron.loadData().then(d=>{const nd=d||{};nd.history=next;nd.language=lang;window.electron.saveData(nd);}).catch(console.error);
      return next;
    });
    showToast(T("Result saved successfully!","Resultado salvo com sucesso!"));
    setTab("history");
    setTimeout(()=>histRef.current?.scrollIntoView({behavior:"smooth"}),150);
  };

  const resetForm=()=>{setVals(initVals());setPhotoFile(null);setPhotoPreview(null);setPhotoThumb(null);};
  const deleteEntry=id=>{
    setHistory(prev=>{const next=prev.filter(e=>e.id!==id);if(window.electron?.saveData)window.electron.loadData().then(d=>{const nd=d||{};nd.history=next;window.electron.saveData(nd);}).catch(console.error);return next;});
    setSelectedRows(prev=>{const n=new Set(prev);n.delete(id);return n;});
  };
  const toggleRow=id=>setSelectedRows(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>selectedRows.size===history.length?setSelectedRows(new Set()):setSelectedRows(new Set(history.map(e=>e.id)));

  const handlePDFExport=async(choice)=>{
    setShowPDF(false);
    let entries=[];
    if(choice==="current"){if(!complete){showToast(T("Complete all parameters first.","Preencha todos os parâmetros primeiro."));return;}entries=[buildCurrentEntry()];}
    else if(choice==="selected"){entries=history.filter(e=>selectedRows.has(e.id));if(!entries.length){showToast(T("No samples selected.","Nenhuma amostra selecionada."));return;}}
    else{entries=[...history];if(!entries.length){showToast(T("History is empty.","Histórico vazio."));return;}}
    try{
      showToast(T("Generating PDF…","Gerando PDF…"),8000);
      const doc=await generatePDF({entries,lang});
      const name=entries.length===1?`3DFPQ-${entries[0].code||"report"}.pdf`:`3DFPQ-report-${new Date().toISOString().slice(0,10)}.pdf`;
      if(window.electron?.saveFile){
        const res=await window.electron.saveFile({filename:name,content:new Uint8Array(doc.output("arraybuffer"))});
        if(res?.success)showToast(T(`PDF saved: ${res.path}`,`PDF salvo: ${res.path}`),5000);
        else showToast(T("Export cancelled.","Exportação cancelada."));
      }else{doc.save(name);showToast(T("PDF downloaded!","PDF baixado!"));}
    }catch(err){console.error(err);showToast(T("Error: ","Erro: ")+(err.message||""),5000);}
  };

  const chartData=[...history].reverse().slice(-12).map(e=>({name:e.code,score:parseFloat(e.score.toFixed(3))}));

  const S={
    card:{background:"#fff",borderRadius:"8px",border:"1px solid #e5e7eb",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:"14px"},
    ch:(x={})=>({padding:"12px 20px",borderBottom:"1px solid #f3f4f6",fontWeight:"700",fontSize:"12px",letterSpacing:"0.07em",textTransform:"uppercase",color:"#374151",display:"flex",justifyContent:"space-between",alignItems:"center",...x}),
    cb:{padding:"18px 20px"},
    label:{fontSize:"11px",fontWeight:"600",color:"#6b7280",display:"block",marginBottom:"4px",textTransform:"uppercase",letterSpacing:"0.04em"},
    input:{width:"100%",padding:"8px 11px",borderRadius:"6px",border:"1px solid #d1d5db",fontSize:"13px",fontFamily:"inherit",background:"#f9fafb",boxSizing:"border-box",outline:"none"},
    btn:(bg=PRIMARY,text="#fff",x={})=>({padding:"8px 18px",borderRadius:"6px",border:"none",background:bg,color:text,fontWeight:"600",fontSize:"13px",cursor:"pointer",fontFamily:"inherit",transition:"opacity 0.12s",...x}),
    tab:a=>({padding:"9px 22px",border:"none",fontFamily:"inherit",fontWeight:"600",fontSize:"13px",cursor:"pointer",background:"transparent",color:a?"#1e3a8a":"#6b7280",borderBottom:a?`2.5px solid ${PRIMARY}`:"2.5px solid transparent",transition:"all 0.12s"}),
    th:{padding:"10px 14px",textAlign:"left",fontSize:"12px",fontWeight:"700",color:"#374151",borderBottom:"2px solid #e5e7eb",whiteSpace:"nowrap",background:"#f8fafc"},
    td:{padding:"10px 14px",fontSize:"13px",borderBottom:"1px solid #f3f4f6",verticalAlign:"middle"},
    g2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"},
    g3:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"},
    g4:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"12px"},
  };

  return (
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",background:"#f3f4f6",minHeight:"100vh",color:"#111827"}}>

      {/* HEADER */}
      <div style={{background:"#fff",borderBottom:"2px solid #bfdbfe",boxShadow:"0 1px 8px rgba(37,99,235,0.07)"}}>
        {/* top strip */}
        <div style={{background:"#eff6ff",borderBottom:"1px solid #dbeafe",padding:"4px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:"11px",color:"#64748b",fontFamily:"monospace",letterSpacing:"0.04em"}}>
            3DFPQ v3.0 &nbsp;·&nbsp; LOPES, L.C.; COSTA, J.A.V.; ROSA, G.M. &nbsp;·&nbsp; FURG &nbsp;·&nbsp; {T("Registered under Brazilian Law 9.609/1998","Registrado pela Lei 9.609/1998")}
          </span>
          <div style={{display:"flex",gap:"6px"}}>
            <button onClick={()=>setShowPDF(true)} style={{...S.btn("#1e40af"),padding:"4px 12px",fontSize:"11px"}}>
              📄 {T("Export PDF","Exportar PDF")}
            </button>
            <button onClick={()=>setLang(l=>l==="en"?"pt":"en")} style={{...S.btn(PRIMARY),padding:"4px 12px",fontSize:"11px"}}>
              {lang==="en"?"🇧🇷 PT":"🇺🇸 EN"}
            </button>
          </div>
        </div>

        {/* main header — centered */}
        <div style={{padding:"22px 28px 18px",textAlign:"center",position:"relative"}}>
          {/* accent line */}
          <div style={{width:"48px",height:"3px",background:"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:"2px",margin:"0 auto 14px"}}/>

          <h1 style={{fontSize:"24px",fontWeight:"800",color:"#1e3a8a",margin:"0 0 6px",letterSpacing:"-0.02em",lineHeight:1.2}}>
            {T(
              "3D Food Printing Quality Calculator",
              "Calculadora de Qualidade de Impressão 3D de Alimentos"
            )}
          </h1>

          <p style={{fontSize:"13px",color:"#475569",margin:"0 0 10px",lineHeight:1.6,maxWidth:"620px",marginLeft:"auto",marginRight:"auto"}}>
            {T(
              "A multicriteria evaluation tool for 3D-printed food products, combining objective instrumental measurements with standardized qualitative assessment criteria.",
              "Ferramenta de avaliação multicritério para produtos alimentícios impressos em 3D, combinando medidas instrumentais objetivas com critérios qualitativos padronizados."
            )}
          </p>

          <div style={{display:"inline-flex",gap:"8px",flexWrap:"wrap",justifyContent:"center"}}>
            <span style={{background:"#eff6ff",color:"#1e40af",fontSize:"11px",fontWeight:"700",padding:"3px 10px",borderRadius:"999px",border:"1px solid #bfdbfe",fontFamily:"monospace"}}>
              ⚗ {T("1 objective parameter","1 parâmetro objetivo")}
            </span>
            <span style={{background:"#fef3c7",color:"#92400e",fontSize:"11px",fontWeight:"700",padding:"3px 10px",borderRadius:"999px",border:"1px solid #fde68a",fontFamily:"monospace"}}>
              👁 {T("5 qualitative parameters","5 parâmetros qualitativos")}
            </span>
            <span style={{background:"#f0fdf4",color:"#065f46",fontSize:"11px",fontWeight:"700",padding:"3px 10px",borderRadius:"999px",border:"1px solid #bbf7d0",fontFamily:"monospace"}}>
              Q = Σ(wᵢ·Sᵢ) / Σwᵢ
            </span>
          </div>
        </div>
      </div>

      <div style={{maxWidth:"1100px",margin:"0 auto",padding:"18px 16px 48px"}}>

        {/* TABS */}
        <div style={{display:"flex",borderBottom:"2px solid #e5e7eb",marginBottom:"18px",background:"#fff",borderRadius:"8px 8px 0 0",paddingLeft:"8px"}}>
          {[["eval",T("Evaluation","Avaliação")],["guide",T("Scoring Guide","Guia de Pontuação")],["history",T(`History (${history.length})`,`Histórico (${history.length})`)]].map(([k,lbl])=>(
            <button key={k} style={S.tab(tab===k)} onClick={()=>setTab(k)}>{lbl}</button>
          ))}
        </div>

        {/* ════ EVALUATION ════ */}
        {tab==="eval"&&(<>
          <div style={S.card}>
            <div style={S.ch()}>{T("Sample Information","Informações da Amostra")}</div>
            <div style={S.cb}>
              <div style={{...S.g3,marginBottom:"12px"}}>
                {[["sampleCode",T("Sample Code","Código da Amostra"),"text","e.g. T40-Ret-01"],
                  ["date",T("Date","Data"),"date",""],
                  ["ingredients",T("Formulation","Formulação"),"text","e.g. Spirulina + Açaí"]
                ].map(([k,lbl,type,ph])=>(
                  <div key={k}><label style={S.label}>{lbl}</label>
                    <input style={S.input} type={type} placeholder={ph} value={info[k]}
                      onChange={e=>setInfo(p=>({...p,[k]:e.target.value}))}/></div>
                ))}
              </div>
              <div style={{...S.g4,marginBottom:"12px"}}>
                {[["speed",T("Speed (mm/s)","Velocidade (mm/s)"),"10"],["flowRate",T("Flow Rate (%)","Fluxo (%)"),"100"],["nozzle",T("Nozzle (mm)","Bico (mm)"),"1.2"],["temp",T("Temp (°C)","Temp (°C)"),"25"]].map(([k,lbl,ph])=>(
                  <div key={k}><label style={S.label}>{lbl}</label>
                    <input style={S.input} type="number" placeholder={ph} value={info[k]}
                      onChange={e=>setInfo(p=>({...p,[k]:e.target.value}))}/></div>
                ))}
              </div>
              <div style={{...S.g2,marginBottom:"14px"}}>
                <div><label style={S.label}>{T("Fill Pattern","Padrão de Preenchimento")}</label>
                  <select style={S.input} value={info.pattern} onChange={e=>setInfo(p=>({...p,pattern:e.target.value}))}>
                    {FILL_PATTERNS.map(v=><option key={v}>{v}</option>)}</select></div>
                <div><label style={S.label}>{T("Fill %","Preenchimento %")}</label>
                  <select style={S.input} value={info.fillPct} onChange={e=>setInfo(p=>({...p,fillPct:e.target.value}))}>
                    {FILL_PERCENTAGES.map(v=><option key={v}>{v}</option>)}</select></div>
              </div>

              {/* ── Photo upload ── */}
              <div style={{padding:"14px",background:"#f8fafc",borderRadius:"8px",border:"1px dashed #d1d5db"}}>
                <label style={{...S.label,marginBottom:"8px"}}>📷 {T("Sample Photo (optional)","Foto da Amostra (opcional)")}</label>
                <input type="file" accept="image/jpeg,image/jpg,image/png" onChange={handlePhotoChange}
                  style={{fontSize:"13px",fontFamily:"inherit",color:"#374151",display:"block",marginBottom:"10px"}}/>
                {photoPreview&&(
                  <div style={{display:"flex",alignItems:"flex-start",gap:"14px"}}>
                    <img src={photoPreview} alt="preview" style={{maxWidth:"200px",maxHeight:"150px",borderRadius:"6px",border:"1px solid #e5e7eb",objectFit:"cover",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}/>
                    <div>
                      <div style={{fontSize:"12px",color:"#6b7280",marginBottom:"8px",lineHeight:1.5}}>
                        {T("Photo will be saved with this evaluation and displayed in history and PDF.","A foto será salva com esta avaliação e exibida no histórico e no PDF.")}
                      </div>
                      <button onClick={()=>{setPhotoFile(null);setPhotoPreview(null);setPhotoThumb(null);}}
                        style={S.btn("#f3f4f6","#374151",{fontSize:"12px",padding:"5px 12px"})}>
                        🗑 {T("Remove photo","Remover foto")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Informative measurements */}
          <div style={{...S.card,border:"1px dashed #d1d5db",background:"#fafafa"}}>
            <div style={S.ch({color:"#9ca3af"})}>
              <span>{T("Recorded Measurements","Medidas Registradas")}</span>
              <span style={{fontSize:"10px",fontWeight:"400"}}>{T("informative — not included in 3DFPQ score","informativo — não compõem a pontuação 3DFPQ")}</span>
            </div>
            <div style={S.cb}>
              <div style={S.g3}>
                {[["expansionRate",T("Expansion Rate (%)","Taxa de Expansão (%)"),"e.g. -0.35"],
                  ["density",T("Apparent Density (g/cm³)","Densidade Aparente (g/cm³)"),"e.g. 0.95"],
                  ["notes",T("Notes","Observações"),T("Anomalies…","Anomalias…")]
                ].map(([k,lbl,ph])=>(
                  <div key={k}><label style={S.label}>{lbl}</label>
                    <input style={S.input} placeholder={ph} value={info[k]}
                      onChange={e=>setInfo(p=>({...p,[k]:e.target.value}))}/></div>
                ))}
              </div>
            </div>
          </div>

          {/* Objective parameter */}
          <div style={S.card}>
            <div style={S.ch()}>
              <span>⚗ {T("Objective Parameter","Parâmetro Objetivo")}</span>
            </div>
            {objParams.map(p=>{
              const val=vals[p.key];const s=val.score;const col=scoreColor(s);
              return(
                <div key={p.key} style={{padding:"18px 20px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"20px",alignItems:"start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px",flexWrap:"wrap"}}>
                        <span style={{fontWeight:"700",fontSize:"15px"}}>{T(p.en,p.pt)}</span>
                        <TypeBadge type="objective" lang={lang}/>
                        <span style={{fontSize:"12px",color:"#6b7280"}}>w = {(p.weight*100).toFixed(0)}%</span>
                      </div>
                      <p style={{fontSize:"12px",color:"#6b7280",margin:"0 0 12px",lineHeight:1.5}}>{T(p.descEn,p.descPt)}</p>
                      <div style={{display:"flex",alignItems:"flex-end",gap:"14px",flexWrap:"wrap"}}>
                        <div>
                          <label style={{...S.label,textTransform:"none",letterSpacing:0}}>{T(p.inputLabelEn,p.inputLabelPt)}</label>
                          <input style={{...S.input,width:"180px"}} type="number" step="0.001"
                            placeholder={p.placeholder} value={val.raw}
                            onChange={e=>setObjRaw(p.key,e.target.value,p.converter)}/>
                        </div>
                        {s!==null&&(
                          <div style={{textAlign:"center",paddingBottom:"2px"}}>
                            <div style={{fontSize:"11px",color:"#9ca3af",marginBottom:"2px"}}>→ {T("Score","Pontuação")}</div>
                            <div style={{fontSize:"36px",fontWeight:"800",color:col,fontFamily:"monospace",lineHeight:1}}>{s}</div>
                            <div style={{fontSize:"11px",color:col,marginTop:"2px"}}>{p.scaleRows.find(r=>r[0]===s)?.[1]}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{minWidth:"140px"}}>
                      {s!==null&&<><MiniBar score={s} weight={p.weight}/>
                      <div style={{fontSize:"10px",color:"#9ca3af",marginTop:"4px",fontFamily:"monospace",textAlign:"right"}}>{s} × {p.weight} = {(s*p.weight).toFixed(3)}</div></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Qualitative parameters */}
          <div style={S.card}>
            <div style={S.ch()}>
              <span>👁 {T("Qualitative Parameters","Parâmetros Qualitativos")}</span>
              <span style={{fontSize:"11px",fontWeight:"400",color:"#9ca3af"}}>{qualParams.filter(p=>vals[p.key].score!==null).length}/{qualParams.length} {T("filled","preenchidos")}</span>
            </div>
            {qualParams.map((p,i)=>{
              const val=vals[p.key];const s=val.score;const col=scoreColor(s);
              const mTag=p.moment==="during"?{txt:T("⏱ Observe DURING printing","⏱ Observar DURANTE a impressão"),color:"#2563eb"}:{txt:T("🔍 Evaluate AFTER printing","🔍 Avaliar APÓS a impressão"),color:"#7c3aed"};
              return(
                <div key={p.key} style={{padding:"18px 20px",borderTop:"1px solid #f3f4f6",background:i%2===0?"#fff":"#fafafa"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"20px",alignItems:"start"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px",flexWrap:"wrap"}}>
                        <span style={{fontWeight:"700",fontSize:"15px"}}>{T(p.en,p.pt)}</span>
                        <TypeBadge type="qualitative" moment={p.moment} lang={lang}/>
                        <span style={{fontSize:"12px",color:"#6b7280"}}>w = {(p.weight*100).toFixed(0)}%</span>
                      </div>
                      <p style={{fontSize:"12px",color:"#6b7280",margin:"0 0 4px",lineHeight:1.5}}>{T(p.descEn,p.descPt)}</p>
                      <div style={{fontSize:"11px",fontWeight:"700",color:mTag.color,marginBottom:"10px"}}>{mTag.txt}</div>
                      <ScoreButtons value={s} onChange={v=>setQual(p.key,v)}/>
                      {s!==null&&<div style={{marginTop:"8px",fontSize:"12px",color:col,fontWeight:"600",fontStyle:"italic"}}>"{p.scaleRows.find(r=>r[0]===s)?.[2]}"</div>}
                    </div>
                    <div style={{minWidth:"140px"}}>
                      {s!==null&&<><MiniBar score={s} weight={p.weight}/>
                      <div style={{fontSize:"10px",color:"#9ca3af",marginTop:"4px",fontFamily:"monospace",textAlign:"right"}}>{s} × {p.weight} = {(s*p.weight).toFixed(3)}</div></>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Result + Recommendations */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
            <div style={{...S.card,background:quality?.bg||"#fff",border:`1.5px solid ${quality?.border||"#e5e7eb"}`,marginBottom:0}}>
              <div style={S.ch()}>{T("Final Score — 3DFPQ","Pontuação Final — 3DFPQ")}</div>
              <div style={S.cb}>
                <div style={{display:"flex",alignItems:"center",gap:"20px",marginBottom:"16px"}}>
                  {finalScore!==null?<RadialScore score={finalScore} color={quality.color}/>
                    :<div style={{width:"104px",height:"104px",borderRadius:"50%",background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"28px",color:"#d1d5db"}}>?</span></div>}
                  <div>
                    {finalScore!==null?(<>
                      <div style={{fontSize:"11px",color:"#6b7280",letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:"600",marginBottom:"2px"}}>3DFPQ</div>
                      <div style={{fontSize:"42px",fontWeight:"800",color:quality.color,lineHeight:1,fontFamily:"monospace"}}>{finalScore.toFixed(3)}</div>
                      <div style={{fontSize:"19px",fontWeight:"700",color:quality.color,marginTop:"2px"}}>{T(quality.en,quality.pt)}</div>
                      <div style={{fontSize:"11px",color:"#9ca3af",marginTop:"4px",fontFamily:"monospace"}}>Q = Σ(wᵢ·Sᵢ) / Σwᵢ</div>
                    </>):(
                      <div style={{color:"#9ca3af"}}>
                        <div style={{fontSize:"15px",marginBottom:"4px"}}>{filled}/{PARAMS.length} {T("filled","preenchidos")}</div>
                        <div style={{fontSize:"12px"}}>{T("Complete all parameters.","Preencha todos os parâmetros.")}</div>
                      </div>
                    )}
                  </div>
                </div>
                {finalScore!==null&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"14px"}}>
                    {PARAMS.map(p=>{const s=vals[p.key].score;const col=scoreColor(s);return(
                      <div key={p.key} style={{background:"#fff",borderRadius:"6px",padding:"7px 10px",border:"1px solid #f3f4f6"}}>
                        <div style={{fontSize:"10px",color:"#6b7280",marginBottom:"2px"}}>{T(p.en,p.pt)}</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                          <span style={{fontSize:"18px",fontWeight:"800",color:col,fontFamily:"monospace"}}>{s}</span>
                          <span style={{fontSize:"10px",color:"#9ca3af"}}>{(s*p.weight).toFixed(3)}</span>
                        </div>
                      </div>
                    );})}
                  </div>
                )}
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  <button onClick={saveEntry} disabled={!complete} style={{...S.btn(complete?PRIMARY:"#d1d5db"),opacity:complete?1:0.6}}>{T("Save Result","Salvar Resultado")}</button>
                  <button onClick={resetForm} style={S.btn(WARN)}>{T("Reset","Zerar")}</button>
                </div>
              </div>
            </div>

            <div style={{...S.card,marginBottom:0}}>
              <div style={S.ch()}>{T("Recommendations","Recomendações")}</div>
              <div style={{...S.cb,maxHeight:"480px",overflowY:"auto"}}>
                {recParams.length===0?(
                  <div style={{color:"#6b7280",fontSize:"13px",fontStyle:"italic",lineHeight:1.6}}>
                    {complete?T("✅ All parameters ≥ 4. Excellent print quality!","✅ Todos os parâmetros ≥ 4. Excelente qualidade!"):T("Score all parameters to see recommendations.","Pontue todos os parâmetros para ver recomendações.")}
                  </div>
                ):recParams.map(p=>{
                  const s=vals[p.key].score;
                  const rec=getRecommendations(p.key,s,info,lang);
                  if(!rec) return null;
                  const accent=s===1?"#dc2626":s===2?"#d97706":"#2563eb";
                  const icon=s===1?"🔴":s===2?"🟠":"🔵";
                  return(
                    <div key={p.key} style={{marginBottom:"12px",padding:"10px 12px",background:s===1?"#fef2f2":s===2?"#fef9f0":"#eff6ff",borderRadius:"6px",borderLeft:`3px solid ${accent}`}}>
                      <div style={{fontSize:"12px",fontWeight:"700",color:"#374151",marginBottom:"6px"}}>{icon} {T(p.en,p.pt)} <span style={{color:accent,fontFamily:"monospace"}}>({s}/5)</span></div>
                      {rec.split("\n").map((line,li)=>(
                        line.trim() ? (
                          <div key={li} style={{fontSize:"12px",color:line.startsWith("•")?"#374151":"#555",lineHeight:1.6,marginBottom:"2px",paddingLeft:line.startsWith("•")?"8px":"0",fontWeight:line.startsWith("•")?"400":"600"}}>
                            {line}
                          </div>
                        ) : null
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>)}

        {/* ════ SCORING GUIDE ════ */}
        {tab==="guide"&&(
          <div style={S.card}>
            <div style={S.ch()}>{T("3DFPQ — Complete Scoring Guide","3DFPQ — Guia Completo de Pontuação")}</div>
            <div style={S.cb}>
              <p style={{fontSize:"13px",color:"#6b7280",marginBottom:"20px",lineHeight:1.7}}>
                {T("The 3DFPQ combines one objective parameter auto-converted from caliper measurements (Dimensional Fidelity, w=30%) and five qualitative parameters with standardized visual criteria (w=70%). Expansion rate and apparent density are recorded for traceability but do not enter the score.",
                   "O 3DFPQ combina um parâmetro objetivo convertido automaticamente de medições por paquímetro (Fidelidade Dimensional, w=30%) e cinco parâmetros qualitativos com critérios visuais padronizados (w=70%). Taxa de expansão e densidade aparente são registradas para rastreabilidade mas não compõem a pontuação.")}
              </p>
              <div style={{background:"#f8fafc",borderRadius:"8px",padding:"16px",border:"1px solid #e5e7eb",marginBottom:"24px"}}>
                <div style={{fontWeight:"700",fontSize:"12px",letterSpacing:"0.07em",textTransform:"uppercase",color:"#374151",marginBottom:"12px"}}>{T("Weight Distribution — Σ = 1.00","Distribuição de Pesos — Σ = 1,00")}</div>
                {PARAMS.map(p=>(
                  <div key={p.key} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
                    <span style={{fontSize:"11px",color:p.type==="objective"?"#1e40af":"#92400e",fontFamily:"monospace",fontWeight:"700",width:"14px"}}>{p.type==="objective"?"⚗":"👁"}</span>
                    <span style={{fontSize:"13px",minWidth:"220px"}}>{T(p.en,p.pt)}</span>
                    <div style={{flex:1,height:"8px",background:"#e5e7eb",borderRadius:"4px",overflow:"hidden"}}>
                      <div style={{width:`${p.weight*100}%`,height:"100%",background:p.type==="objective"?PRIMARY:"#d97706",borderRadius:"4px"}}/>
                    </div>
                    <span style={{fontSize:"13px",fontWeight:"700",fontFamily:"monospace",minWidth:"36px"}}>{(p.weight*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div style={{fontWeight:"700",fontSize:"12px",letterSpacing:"0.07em",textTransform:"uppercase",color:"#1e40af",marginBottom:"10px"}}>⚗ {T("Objective Parameter — Conversion Table","Parâmetro Objetivo — Tabela de Conversão")}</div>
              {objParams.map(p=>(
                <div key={p.key} style={{marginBottom:"20px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                    <span style={{fontWeight:"700",fontSize:"14px"}}>{T(p.en,p.pt)}</span>
                    <span style={{fontSize:"12px",color:"#6b7280"}}>→ {T(p.inputLabelEn,p.inputLabelPt)}</span>
                    <span style={{fontSize:"11px",color:"#9ca3af",fontFamily:"monospace"}}>[{p.ref}]</span>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
                    <thead><tr style={{background:"#eff6ff"}}>
                      <th style={{padding:"8px 12px",textAlign:"center",border:"1px solid #e5e7eb",width:"60px"}}>{T("Score","Pontuação")}</th>
                      <th style={{padding:"8px 12px",textAlign:"left",border:"1px solid #e5e7eb",width:"160px"}}>{T("Range","Faixa")}</th>
                      <th style={{padding:"8px 12px",textAlign:"left",border:"1px solid #e5e7eb"}}>{T("Interpretation","Interpretação")}</th>
                    </tr></thead>
                    <tbody>{p.scaleRows.map(([sc,range,interp])=>(
                      <tr key={sc}>
                        <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid #e5e7eb",fontWeight:"800",color:scoreColor(sc),fontSize:"18px",fontFamily:"monospace"}}>{sc}</td>
                        <td style={{padding:"8px 12px",border:"1px solid #e5e7eb",fontFamily:"monospace"}}>{range}</td>
                        <td style={{padding:"8px 12px",border:"1px solid #e5e7eb"}}>{interp}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ))}
              <div style={{fontWeight:"700",fontSize:"12px",letterSpacing:"0.07em",textTransform:"uppercase",color:"#92400e",margin:"8px 0 12px"}}>👁 {T("Qualitative Parameters — Assessment Criteria","Parâmetros Qualitativos — Critérios de Avaliação")}</div>
              {qualParams.map(p=>{
                const mTag=p.moment==="during"?{txt:T("⏱ Observe during printing","⏱ Observar durante a impressão"),color:"#2563eb"}:{txt:T("🔍 Evaluate after printing","🔍 Avaliar após a impressão"),color:"#7c3aed"};
                return(
                  <div key={p.key} style={{marginBottom:"20px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                      <span style={{fontWeight:"700",fontSize:"14px"}}>{T(p.en,p.pt)}</span>
                      <TypeBadge type="qualitative" moment={p.moment} lang={lang}/>
                      <span style={{fontSize:"11px",fontWeight:"700",color:mTag.color}}>{mTag.txt}</span>
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
                      <thead><tr style={{background:"#fef3c7"}}>
                        <th style={{padding:"8px 12px",textAlign:"center",border:"1px solid #e5e7eb",width:"60px"}}>{T("Score","Pontuação")}</th>
                        <th style={{padding:"8px 12px",textAlign:"left",border:"1px solid #e5e7eb"}}>{T("Criteria","Critérios")}</th>
                      </tr></thead>
                      <tbody>{p.scaleRows.map(([sc,,crit])=>(
                        <tr key={sc}>
                          <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid #e5e7eb",fontWeight:"800",color:scoreColor(sc),fontSize:"18px",fontFamily:"monospace"}}>{sc}</td>
                          <td style={{padding:"8px 12px",border:"1px solid #e5e7eb"}}>{crit}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                );
              })}
              <div style={{background:"#f0fdf4",borderRadius:"8px",padding:"16px",border:"1px solid #bbf7d0"}}>
                <div style={{fontWeight:"700",fontSize:"12px",letterSpacing:"0.07em",textTransform:"uppercase",color:"#065f46",marginBottom:"10px"}}>{T("Final Score — Classification","Pontuação Final — Classificação")}</div>
                {QUALITY.map(q=>(
                  <div key={q.en} style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"8px"}}>
                    <span style={{fontWeight:"800",color:q.color,fontFamily:"monospace",minWidth:"100px"}}>{scoreRangeLbl(q)}</span>
                    <span style={{background:q.bg,color:q.color,fontWeight:"700",padding:"2px 12px",borderRadius:"999px",border:`1px solid ${q.border}`,fontSize:"13px"}}>{T(q.en,q.pt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ HISTORY ════ */}
        {tab==="history"&&(<>
          <div ref={histRef}/>
          {history.length>0&&(
            <div style={S.card}>
              <div style={S.ch()}>{T("Score History","Histórico de Pontuações")}</div>
              <div style={{padding:"12px 20px 16px",height:"210px"}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{top:4,right:16,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:"#6b7280"}}/>
                    <YAxis domain={[0,5]} ticks={[1,2,3,4,5]} tick={{fontSize:11,fill:"#6b7280"}}/>
                    <Tooltip contentStyle={{fontSize:"12px",borderRadius:"6px",border:"1px solid #e5e7eb"}}/>
                    <ReferenceLine y={4} stroke="#16a34a" strokeDasharray="4 3" strokeWidth={1}/>
                    <ReferenceLine y={3} stroke="#d97706" strokeDasharray="4 3" strokeWidth={1}/>
                    <Line type="monotone" dataKey="score" stroke={PRIMARY} strokeWidth={2.5} dot={{fill:PRIMARY,r:4}} activeDot={{r:6}} name="3DFPQ"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:"8px",marginBottom:"10px",flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setSelectedRows(new Set(history.map(e=>e.id)))} disabled={history.length===0} style={{...S.btn("#6b7280"),opacity:history.length?1:0.5}}>{T("Select All","Selecionar Tudo")}</button>
            <button onClick={()=>setSelectedRows(new Set())} disabled={selectedRows.size===0} style={{...S.btn("#e5e7eb","#374151"),opacity:selectedRows.size?1:0.4}}>{T("Clear Selection","Limpar Seleção")}</button>
            <button onClick={()=>exportCSV(selectedRows.size?history.filter(e=>selectedRows.has(e.id)):history,lang)} disabled={history.length===0} style={{...S.btn(SUCCESS),opacity:history.length?1:0.5}}>
              {T(`Export CSV${selectedRows.size?` (${selectedRows.size})`:""}`,`Exportar CSV${selectedRows.size?` (${selectedRows.size})`:""}`)}
            </button>
            <button onClick={()=>setShowPDF(true)} disabled={history.length===0} style={{...S.btn("#1e40af"),opacity:history.length?1:0.5}}>
              {T(`Export PDF${selectedRows.size?` (${selectedRows.size} selected)`:""}`,`Exportar PDF${selectedRows.size?` (${selectedRows.size} selecionadas)`:""}`)}
            </button>
            <span style={{fontSize:"12px",color:"#9ca3af",marginLeft:"auto"}}>{history.length} {T("record(s)","registro(s)")}</span>
          </div>
          {history.length===0?<div style={{...S.card,textAlign:"center",padding:"48px",color:"#9ca3af"}}>{T("No saved evaluations yet.","Nenhuma avaliação salva.")}</div>:(
            <div style={{...S.card,overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:"900px"}}>
                <thead><tr>
                  <th style={{...S.th,width:"36px"}}><input type="checkbox" checked={selectedRows.size===history.length&&history.length>0} onChange={toggleAll} style={{cursor:"pointer"}}/></th>
                  {[T("Code","Código"),T("Date","Data"),T("Formulation","Formulação"),T("Pattern","Padrão"),T("Fill","Preench."),T("Speed","Veloc."),T("Flow","Fluxo"),T("Nozzle","Bico"),
                    T("Dim.Fid.","Fid.Dim."),T("Layer Adh.","Ades.Cam."),T("Extrus.","Extrus."),T("Struct.","Estruct."),T("Surface","Superf."),T("Fill Unif.","Unif.Preen."),
                    "3DFPQ",T("Quality","Qualidade"),T("Photo","Foto"),T("Actions","Ações")].map(h=><th key={h} style={{...S.th,fontSize:"11px"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {history.map((e,i)=>{
                    const q=getQuality(e.score);const sel=selectedRows.has(e.id);
                    return(
                      <tr key={e.id} style={{background:sel?"#eff6ff":i%2===0?"#fff":"#fafafa"}}>
                        <td style={S.td}><input type="checkbox" checked={sel} onChange={()=>toggleRow(e.id)} style={{cursor:"pointer"}}/></td>
                        <td style={{...S.td,fontFamily:"monospace",fontWeight:"600"}}>{e.code}</td>
                        <td style={S.td}>{e.date}</td>
                        <td style={{...S.td,maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.ingredients||"—"}</td>
                        <td style={S.td}>{e.pattern}</td>
                        <td style={S.td}>{e.fillPct}</td>
                        <td style={S.td}>{e.speed||"—"}</td>
                        <td style={S.td}>{e.flowRate?`${e.flowRate}%`:"—"}</td>
                        <td style={S.td}>{e.nozzle?`${e.nozzle}mm`:"—"}</td>
                        {["dimensionalFidelity","layerAdhesion","extrusionConsistency","structuralQuality","surfaceFinish","fillUniformity"].map(k=>{
                          const ps=e.paramScores||{};
                          const s=ps[k];
                          return <td key={k} style={{...S.td,textAlign:"center",fontFamily:"monospace",fontWeight:"700",color:s!=null?scoreColor(s):"#d1d5db"}}>{s!=null?s:"—"}</td>;
                        })}
                        <td style={{...S.td,fontFamily:"monospace",fontWeight:"800",color:q.color}}>{e.score.toFixed(3)}</td>
                        <td style={S.td}><span style={{background:q.bg,color:q.color,padding:"2px 8px",borderRadius:"999px",fontSize:"12px",border:`1px solid ${q.border}`}}>{lang==="pt"?e.qualityPt:e.qualityEn}</span></td>
                        <td style={S.td}>
                          {e.photoThumb?<img src={e.photoThumb} alt="thumb" style={{width:"48px",height:"40px",objectFit:"cover",borderRadius:"4px",border:"1px solid #e5e7eb",display:"block"}} onError={ev=>{ev.currentTarget.style.display="none";}}/>:<span style={{color:"#d1d5db",fontSize:"12px"}}>—</span>}
                        </td>
                        <td style={S.td}><button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:"16px",padding:"2px 4px"}} title={T("Delete","Excluir")}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selectedRows.size===1&&(()=>{
            const entry=history.find(e=>selectedRows.has(e.id));if(!entry) return null;
            const q=getQuality(entry.score);
            return(
              <div style={{...S.card,marginTop:"14px"}}>
                <div style={S.ch()}>
                  <span>{T(`Detail — ${entry.code}`,`Detalhe — ${entry.code}`)}</span>
                  <span style={{fontSize:"11px",fontWeight:"400",color:q.color}}>{T(q.en,q.pt)} · {entry.score.toFixed(3)}</span>
                </div>
                <div style={{padding:"16px 20px",display:"flex",gap:"16px",flexWrap:"wrap"}}>
                  {entry.photoThumb&&<img src={entry.photoThumb} alt="sample" style={{width:"150px",height:"115px",objectFit:"cover",borderRadius:"7px",border:"1px solid #e5e7eb",flexShrink:0}} onError={ev=>{ev.currentTarget.style.display="none";}}/>}
                  <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:"10px"}}>
                    {PARAMS.map(p=>{const s=entry.paramScores?.[p.key] ?? null;const col=scoreColor(s);return(
                      <div key={p.key} style={{background:"#f8fafc",borderRadius:"7px",padding:"10px 14px",border:"1px solid #e5e7eb"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                          <span style={{fontSize:"11px",color:"#6b7280"}}>{T(p.en,p.pt)}</span>
                          <span style={{fontSize:"9px",color:p.type==="objective"?"#1e40af":"#92400e",fontFamily:"monospace",fontWeight:"700"}}>{p.type==="objective"?"⚗":"👁"}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                          <span style={{fontSize:"24px",fontWeight:"800",color:col,fontFamily:"monospace"}}>{s??'—'}</span>
                          <span style={{fontSize:"11px",color:"#9ca3af"}}>→ <b style={{color:"#374151"}}>{s!=null?(s*p.weight).toFixed(3):"—"}</b></span>
                        </div>
                      </div>
                    );})}
                  </div>
                </div>
                {(entry.expansionRate||entry.density||entry.notes)&&(
                  <div style={{padding:"0 20px 16px",display:"flex",gap:"16px",flexWrap:"wrap",fontSize:"12px",color:"#6b7280"}}>
                    {entry.expansionRate&&<span>📏 {T("Exp. Rate","Taxa Exp.")}: <b style={{color:"#374151"}}>{entry.expansionRate}%</b></span>}
                    {entry.density&&<span>⚖️ {T("Density","Dens.")}: <b style={{color:"#374151"}}>{entry.density} g/cm³</b></span>}
                    {entry.notes&&<span>📝 {entry.notes}</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </>)}

        <div style={{textAlign:"center",fontSize:"11px",color:"#9ca3af",marginTop:"16px",fontFamily:"monospace"}}>
          3DFPQ v3.0 · LOPES, L.C.; COSTA, J.A.V.; ROSA, G.M. · FURG · {T("Registered under Brazilian Law 9.609/1998","Registrado pela Lei 9.609/1998")} · Q = Σ(wᵢ·Sᵢ) / Σwᵢ
        </div>
      </div>

      {showPDF&&<PDFModal onClose={()=>setShowPDF(false)} onExport={handlePDFExport} hasCurrent={complete} historyCount={history.length} lang={lang}/>}
      <Toast msg={toast.msg} show={toast.show}/>
    </div>
  );
}