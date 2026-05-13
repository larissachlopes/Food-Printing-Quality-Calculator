import React, { useEffect, useState, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./QualityCalculator.css";
import translations from "../translations";

const DEFAULT_PARAMETERS = [
  { key: "dimensionalAccuracy", defaultWeight: 0.25 },
  { key: "layerAdhesion", defaultWeight: 0.2 },
  { key: "extrusionConsistency", defaultWeight: 0.2 },
  { key: "structuralQuality", defaultWeight: 0.15 },
  { key: "surfaceFinish", defaultWeight: 0.1 },
  { key: "fillUniformity", defaultWeight: 0.05 },
  { key: "printPrecision", defaultWeight: 0.05 },
];

const PATTERN_KEYS = ["retilineo", "triangular", "giroide", "hexagono", "customizado"];

const QualityCalculator = () => {
  const [language, setLanguage] = useState("pt");
  const t = translations[language] || translations["pt"];

  const [weights, setWeights] = useState(() => {
    const w = {};
    DEFAULT_PARAMETERS.forEach((p) => (w[p.key] = p.defaultWeight));
    return w;
  });

  const [scores, setScores] = useState(() =>
    DEFAULT_PARAMETERS.reduce((acc, p) => {
      acc[p.key] = 1;
      return acc;
    }, {})
  );

  const [sampleInfo, setSampleInfo] = useState({
    sampleCode: "",
    date: new Date().toISOString().split("T")[0],
    printingSpeed: 10,
    flowRate: 100,
    nozzleSize: 0.4,
    ingredients: "",
    fillingPattern: "retilineo",
    fillPercentage: 60,
    processingTemp: 25,
  });

  const [historyData, setHistoryData] = useState([]);
  const [selectedSamples, setSelectedSamples] = useState(new Set());
  const [selectedChartData, setSelectedChartData] = useState([]);
  const [showSelectedChart, setShowSelectedChart] = useState(false);

  const [toast, setToast] = useState({ msg: "", show: false });
  const showToast = (msg, ms = 3000) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: "", show: false }), ms);
  };

  const sampleCodeRef = useRef(null);

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoSaveStatus, setPhotoSaveStatus] = useState(null);

  function handlePhotoChange(e) {
    const f = e?.target?.files?.[0] ?? null;
    if (!f) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoFile(f);
    try {
      const url = URL.createObjectURL(f);
      setPhotoPreview(url);
    } catch (err) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(f);
    }
  }

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  async function createThumbnailUint8(file, maxWidth = 400, quality = 0.75) {
    const img = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = reader.result;
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    const ratio = img.width / img.height || 1;
    let w = img.width;
    let h = img.height;
    if (w > maxWidth) {
      w = maxWidth;
      h = Math.round(maxWidth / ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async function savePhotoToUserDataAndThumb(defaultName = "impressao.png") {
    if (!photoFile) return { success: false, error: "No photo selected" };

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = (defaultName || "impressao.png").replace(/\s+/g, "_");
      const extMatch = base.match(/\.[^.]+$/);
      const ext = extMatch ? extMatch[0] : ".png";
      const nameNoExt = extMatch ? base.slice(0, -ext.length) : base;
      const origName = `${nameNoExt}_${timestamp}${ext}`;
      const thumbName = `${nameNoExt}_${timestamp}-thumb.jpg`;

      const origBuf = new Uint8Array(await photoFile.arrayBuffer());
      const thumbBuf = await createThumbnailUint8(photoFile, 400, 0.75);

      if (window.electron && typeof window.electron.saveToUserData === "function") {
        const savedOrig = await window.electron.saveToUserData({ filename: origName, content: origBuf });
        const savedThumb = await window.electron.saveToUserData({ filename: thumbName, content: thumbBuf });

        if (savedOrig.success && savedThumb.success) {
          const res = { success: true, path: savedOrig.path, thumbPath: savedThumb.path };
          setPhotoSaveStatus(res);
          return res;
        } else {
          const err = { success: false, error: savedOrig.error || savedThumb.error || "Save failed" };
          setPhotoSaveStatus(err);
          return err;
        }
      }

      if (!window.electron || typeof window.electron.saveFile !== "function") {
        const err = { success: false, error: "Save API not available" };
        setPhotoSaveStatus(err);
        return err;
      }

      const origRes = await window.electron.saveFile({ filename: origName, content: origBuf });
      const thumbRes = await window.electron.saveFile({ filename: thumbName, content: thumbBuf });

      if (origRes && origRes.success) {
        const res = { success: true, path: origRes.path, thumbPath: thumbRes?.path || null };
        setPhotoSaveStatus(res);
        return res;
      } else {
        const err = { success: false, error: origRes?.error || "User cancelled or save failed" };
        setPhotoSaveStatus(err);
        return err;
      }
    } catch (err) {
      const e = { success: false, error: err.message || String(err) };
      setPhotoSaveStatus(e);
      return e;
    }
  }

  // helper inside component (has access to showToast and language)
  async function openImageOriginal(path) {
    if (!path) {
      showToast(language === 'pt' ? 'Caminho inválido' : 'Invalid path', 3000);
      return;
    }
    if (window.electron && typeof window.electron.openPath === 'function') {
      const res = await window.electron.openPath(path);
      if (!res || res.success) {
        return;
      } else {
        showToast((language === 'pt' ? 'Erro ao abrir: ' : 'Error opening: ') + (res.error || 'unknown'), 4000);
      }
    } else {
      try {
        window.open(`file://${path}`, '_blank');
      } catch (err) {
        showToast(language === 'pt' ? 'Não foi possível abrir a imagem' : 'Could not open image', 3000);
      }
    }
  }

  const migrateEntry = (entry) => {
    const e = { ...entry };
    if (!e.patternKey) {
      const allPatterns = { ...translations.pt.patterns, ...translations.en.patterns };
      if (e.pattern) {
        const foundKey = Object.keys(allPatterns).find((k) => allPatterns[k] === e.pattern);
        if (foundKey) e.patternKey = foundKey;
        else e.patternKey = "retilineo";
      } else {
        e.patternKey = e.fillingPattern || "retilineo";
      }
    }
    if (e.fill == null && e.fillPercentage != null) e.fill = e.fillPercentage;
    if (e.fill == null && sampleInfo.fillPercentage != null) e.fill = sampleInfo.fillPercentage;
    if (e.flowRate == null && e.flow != null) e.flowRate = e.flow;
    if (e.flowRate == null) e.flowRate = e.flowRate ?? sampleInfo.flowRate;
    if (e.nozzleSize == null && e.nozzle) {
      const parsed = parseFloat(String(e.nozzle).replace("mm", "").trim());
      if (!isNaN(parsed)) e.nozzleSize = parsed;
    }
    if (!e.scores) {
      e.scores = {};
      DEFAULT_PARAMETERS.forEach((p) => {
        e.scores[p.key] = 1;
      });
    }
    if (!e.weights) {
      e.weights = {};
      DEFAULT_PARAMETERS.forEach((p) => {
        e.weights[p.key] = weights[p.key] ?? p.defaultWeight;
      });
    }
    if (!e.weightedScores) {
      const ws = {};
      Object.keys(e.weights).forEach((k) => {
        ws[k] = +(Number(e.weights[k] || 0) * Number(e.scores[k] || 0)).toFixed(2);
      });
      e.weightedScores = ws;
    }
    if (e.score == null) {
      e.score = +(Object.values(e.weightedScores || {}).reduce((a, b) => a + Number(b || 0), 0)).toFixed(2);
    }
    return e;
  };

  useEffect(() => {
    (async () => {
      try {
        let stored = null;
        if (window.electron?.loadData) {
          stored = await window.electron.loadData();
        } else {
          const s = localStorage.getItem("qualityCalcHistory");
          stored = s ? JSON.parse(s) : null;
          const lw = localStorage.getItem("qualityCalcWeights");
          if (lw) setWeights(JSON.parse(lw));
          const lg = localStorage.getItem("language");
          if (lg) setLanguage(lg);
        }
        if (stored) {
          const hist = Array.isArray(stored.history) ? stored.history.map((entry) => migrateEntry(entry)) : [];
          setHistoryData(hist);
          if (stored.weights) setWeights(stored.weights);
          if (stored.language) setLanguage(stored.language);
        }
      } catch (err) {
        console.error("load data err:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        if (window.electron?.saveData) {
          const existing = (await window.electron.loadData()) || { history: [] };
          existing.weights = weights;
          existing.language = language;
          await window.electron.saveData(existing);
        } else {
          localStorage.setItem("qualityCalcWeights", JSON.stringify(weights));
        }
      } catch (err) {}
    }, 700);
    return () => clearTimeout(id);
  }, [weights, language]);

  const setPreset = (name) => {
    const presets = {
      balanced: {
        dimensionalAccuracy: 0.25,
        layerAdhesion: 0.2,
        extrusionConsistency: 0.2,
        structuralQuality: 0.15,
        surfaceFinish: 0.1,
        fillUniformity: 0.05,
        printPrecision: 0.05,
      },
      quality: {
        dimensionalAccuracy: 0.3,
        layerAdhesion: 0.25,
        extrusionConsistency: 0.15,
        structuralQuality: 0.1,
        surfaceFinish: 0.1,
        fillUniformity: 0.05,
        printPrecision: 0.05,
      },
      speed: {
        dimensionalAccuracy: 0.2,
        layerAdhesion: 0.15,
        extrusionConsistency: 0.25,
        structuralQuality: 0.15,
        surfaceFinish: 0.1,
        fillUniformity: 0.1,
        printPrecision: 0.05,
      },
    };
    if (presets[name]) setWeights(presets[name]);
  };

  const normalizeWeights = () => {
    const cur = { ...weights };
    const sum = Object.values(cur).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum === 0) return;
    const normalized = {};
    Object.keys(cur).forEach((k) => {
      normalized[k] = +(Number(cur[k]) / sum).toFixed(2);
    });
    let finalSum = Object.values(normalized).reduce((a, b) => a + b, 0);
    if (finalSum !== 1) {
      const keys = Object.keys(normalized);
      const diff = +(1 - finalSum).toFixed(2);
      const maxKey = keys.reduce((m, k) => (normalized[k] > normalized[m] ? k : m), keys[0]);
      normalized[maxKey] = +(normalized[maxKey] + diff).toFixed(2);
    }
    setWeights(normalized);
  };

  const handleWeightChange = (key, value) => {
    const v = parseFloat(value);
    setWeights((prev) => ({ ...prev, [key]: isNaN(v) ? 0 : v }));
  };

  const handleScoreChange = (key, value) => {
    const v = parseInt(value, 10);
    setScores((prev) => ({ ...prev, [key]: isNaN(v) ? 1 : v }));
  };

  const handleInfoChange = (key, value) => {
    setSampleInfo((prev) => ({ ...prev, [key]: value }));
  };

  const calculateFinalScore = (wObj = weights, sObj = scores) => {
    return Object.keys(wObj).reduce((acc, key) => acc + (Number(wObj[key] || 0) * Number(sObj[key] || 0)), 0);
  };

  const finalScore = calculateFinalScore();

  const getQualityColor = (score) => {
    if (score <= 2.0) return "#ef4444";
    if (score <= 3.0) return "#f97316";
    if (score <= 4.0) return "#22c55e";
    return "#10b981";
  };

  const getQualityLevel = (score) => {
    const tr = translations[language] || translations["pt"];
    if (score <= 2.0) return tr.unsatisfactory;
    if (score <= 3.0) return tr.regular;
    if (score <= 4.0) return tr.good;
    return tr.excellent;
  };

  const handleSaveResults = async () => {
    const weightedByParam = {};
    DEFAULT_PARAMETERS.forEach((p) => {
      const w = Number(weights[p.key] ?? p.defaultWeight);
      const s = Number(scores[p.key] ?? 1);
      weightedByParam[p.key] = +(w * s).toFixed(2);
    });

    const final = +(Object.values(weightedByParam).reduce((a, b) => a + Number(b || 0), 0)).toFixed(2);

    const entry = {
      sampleCode: sampleInfo.sampleCode || `Sample-${historyData.length + 1}`,
      date: sampleInfo.date || new Date().toISOString().split("T")[0],
      printingSpeed: sampleInfo.printingSpeed,
      flowRate: sampleInfo.flowRate,
      nozzleSize: sampleInfo.nozzleSize,
      ingredients: sampleInfo.ingredients,
      patternKey: sampleInfo.fillingPattern,
      fill: sampleInfo.fillPercentage,
      processingTemp: sampleInfo.processingTemp,
      scores: { ...scores },
      weights: { ...weights },
      weightedScores: weightedByParam,
      score: final,
    };

    if (photoFile) {
      const defaultName = `impressao-${entry.sampleCode || "amostra"}.png`;
      const photoRes = await savePhotoToUserDataAndThumb(defaultName);
      if (photoRes && photoRes.success) {
        entry.photoPath = photoRes.path;
        entry.photoThumbPath = photoRes.thumbPath;
      } else {
        console.warn("Foto não salva:", photoRes?.error);
      }
    }

    const next = [...historyData, entry];
    setHistoryData(next);

    try {
      if (window.electron?.saveData) {
        const existing = (await window.electron.loadData()) || { history: [] };
        existing.history = next;
        existing.weights = weights;
        existing.language = language;
        await window.electron.saveData(existing);
      } else {
        localStorage.setItem("qualityCalcHistory", JSON.stringify({ history: next, weights, language }));
      }
      showToast(t.saveSuccess);
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
    } catch (err) {
      console.error("save results:", err);
      showToast((t.saveError || "Error: ") + (err.message || err), 5000);
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
    }
  };

  const handleDeleteResult = async (index) => {
    if (!window.confirm(language === "pt" ? "Confirma exclusão?" : "Confirm delete?")) return;
    const next = historyData.filter((_, i) => i !== index);
    setHistoryData(next);
    try {
      if (window.electron?.saveData) {
        const existing = (await window.electron.loadData()) || { history: [] };
        existing.history = next;
        existing.weights = weights;
        existing.language = language;
        await window.electron.saveData(existing);
      } else {
        localStorage.setItem("qualityCalcHistory", JSON.stringify({ history: next, weights, language }));
      }
      showToast(language === "pt" ? "Excluído" : "Deleted");
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
    } catch (err) {
      console.error("delete save:", err);
      showToast("Error: " + (err.message || ""), 4000);
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
    }
  };


  // CSV export with BOM to preserve accents
  const generateSelectedTable = async () => {
    const selected = historyData.filter((h) => selectedSamples.has(h.sampleCode));
    if (!selected.length) {
      showToast(language === "pt" ? "Nenhuma amostra selecionada." : "No samples selected.", 3000);
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
      return;
    }
    const headers = [
      "SampleCode",
      "Date",
      "Ingredients",
      "Pattern",
      "Fill(%)",
      "Speed(mm/s)",
      "Flow(%)",
      "Nozzle(mm)",
      "Score",
    ];
    const rows = selected.map((s) => [
      s.sampleCode,
      s.date,
      (s.ingredients || "").replace(/,/g, ";"),
      translations[language].patterns?.[s.patternKey] ?? s.patternKey,
      s.fill,
      s.printingSpeed,
      s.flowRate ?? s.flow,
      s.nozzleSize,
      (s.score || 0).toFixed(2),
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const csvWithBom = "\uFEFF" + csvContent;

    // electron saveFile if available
    if (window.electron?.saveFile) {
      try {
        const res = await window.electron.saveFile({
          filename: `selected_samples_${new Date().toISOString().slice(0, 10)}.csv`,
          content: csvWithBom,
        });
        if (res?.success) showToast((language === "pt" ? "CSV salvo em: " : "CSV saved: ") + res.path, 4000);
        setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
        return;
      } catch (err) {
        /* fallback */
      }
    }

    const blob = new Blob([csvWithBom], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selected_samples_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(language === "pt" ? "CSV gerado." : "CSV generated.", 3000);
    setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
  };

  // PDF - send selected entries + translations
  const generateSelectedPDF = async () => {
    const selected = historyData.filter((h) => selectedSamples.has(h.sampleCode));
    const entries =
      selected.length > 0
        ? selected
        : [
            {
              sampleInfo,
              scores,
              weights,
              weightedScores: Object.fromEntries(
                Object.keys(weights).map((k) => [k, +(Number(weights[k] || 0) * Number(scores[k] || 0)).toFixed(2)])
              ),
              score: finalScore,
              patternKey: sampleInfo.fillingPattern,
              ingredients: sampleInfo.ingredients,
              fill: sampleInfo.fillPercentage,
              printingSpeed: sampleInfo.printingSpeed,
              flowRate: sampleInfo.flowRate,
              nozzleSize: sampleInfo.nozzleSize,
              date: sampleInfo.date,
              sampleCode: sampleInfo.sampleCode || `Sample-1`,
            },
          ];

    const payload = {
      selectedEntries: entries,
      translations: translations[language] || translations["pt"],
      language,
    };

    try {
      if (window.electron?.exportPdf) {
        const res = await window.electron.exportPdf(payload);
        if (res?.success) showToast((language === "pt" ? "PDF exportado em: " : "PDF exported to: ") + res.path, 4000);
        else showToast(language === "pt" ? "Exportação cancelada" : "Export canceled", 3000);
      } else {
        const html = `<html><head><title>Report</title></head><body>${entries
          .map(
            (e) => `<h2>${e.sampleCode}</h2>
             <p><strong>${t.finalScore}:</strong> ${(e.score || 0).toFixed(2)}</p>
             <p><strong>${t.pattern}:</strong> ${translations[language].patterns?.[e.patternKey] ?? e.patternKey}</p>
            <hr/>`
          )
          .join("")}</body></html>`;
        const w = window.open("", "_blank");
        w.document.write(html);
        w.document.close();
        showToast(language === "pt" ? "Janela de impressão aberta." : "Print window opened.", 3000);
      }
    } catch (err) {
      console.error("export selected pdf:", err);
      showToast("Error exporting PDF: " + (err.message || ""), 5000);
    } finally {
      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
    }
  };

  // selection helpers
  const toggleSelectSample = (sampleCode) => {
    setSelectedSamples((prev) => {
      const next = new Set(prev);
      if (next.has(sampleCode)) next.delete(sampleCode);
      else next.add(sampleCode);
      return next;
    });
  };

  const selectAllSamples = () => setSelectedSamples(new Set(historyData.map((h) => h.sampleCode)));
  const clearSelectedSamples = () => setSelectedSamples(new Set());

  // update menu language on change
  const toggleLanguage = () => {
    const nl = language === "pt" ? "en" : "pt";
    setLanguage(nl);
    if (window.electron?.saveLanguage) window.electron.saveLanguage(nl).catch(() => {});
    else localStorage.setItem("language", nl);
  };

  // prepare data for selected chart
  useEffect(() => {
    if (!showSelectedChart) setSelectedChartData([]);
  }, [showSelectedChart]);

  /* ===========================
     RENDER
     =========================== */
  return (
    <div className="quality-calculator">
      <div className="header-section">
        <h1>{t.title}</h1>
        <div className="header-buttons">
          <button className="language-btn" onClick={toggleLanguage}>
            {language === "pt" ? "EN" : "PT"}
          </button>
        </div>
      </div>

      <div className="main-content">
        {/* Sample info */}
        <div className="info-section">
          <h3>{t.sampleInfo}</h3>
          <div className="grid-3">
            <div className="form-group">
              <label>{t.sampleCode}</label>
              <input
                ref={sampleCodeRef}
                type="text"
                className="form-input"
                value={sampleInfo.sampleCode}
                onChange={(e) => handleInfoChange("sampleCode", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>{t.date}</label>
              <input type="date" className="form-input" value={sampleInfo.date} onChange={(e) => handleInfoChange("date", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t.ingredients}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t.ingredientsPlaceholder}
                value={sampleInfo.ingredients}
                onChange={(e) => handleInfoChange("ingredients", e.target.value)}
              />
            </div>
          </div>
<div className="field photo-upload" style={{ marginTop: 12 }}>
  <label style={{ display: 'block', marginBottom: 6 }}>{t?.photoLabel || 'Foto do impresso'}</label>
  <input
    type="file"
    accept="image/*"
    onChange={handlePhotoChange}
    aria-label="Upload foto do impresso"
  />
  {photoPreview && (
    <div style={{ marginTop: 8 }}>
      <img
        src={photoPreview}
        alt="Preview do impresso"
        style={{ maxWidth: 320, maxHeight: 240, borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
      />
    </div>
  )}
  {photoSaveStatus && (
    <div style={{ marginTop: 6, fontSize: 13 }}>
      {photoSaveStatus.success
        ? <span style={{ color: 'green' }}>Foto salva: {photoSaveStatus.path}</span>
        : <span style={{ color: 'crimson' }}>Erro ao salvar foto: {photoSaveStatus.error}</span>
      }
    </div>
  )}
</div>

          <h4 className="printing-params-title">{t.printingParams}</h4>
          <div className="grid-4">
            <div className="form-group">
              <label>{t.printingSpeed}</label>
              <input type="number" className="form-input" min="1" max="200" value={sampleInfo.printingSpeed} onChange={(e) => handleInfoChange("printingSpeed", Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>{t.flowRate}</label>
              <input type="number" className="form-input" min="0" max="200" value={sampleInfo.flowRate} onChange={(e) => handleInfoChange("flowRate", Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>{t.nozzleSize}</label>
              <input type="number" className="form-input" min="0.1" max="5.0" step="0.1" value={sampleInfo.nozzleSize} onChange={(e) => handleInfoChange("nozzleSize", Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>{t.processingTemp || "Temp (°C)"}</label>
              <input type="number" className="form-input" min="0" max="200" value={sampleInfo.processingTemp} onChange={(e) => handleInfoChange("processingTemp", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label>{t.fillingPattern}</label>
              <select className="form-select" value={sampleInfo.fillingPattern} onChange={(e) => handleInfoChange("fillingPattern", e.target.value)}>
                {PATTERN_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {translations[language].patterns[k]}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t.fillPercentage}</label>
              <select className="form-select" value={sampleInfo.fillPercentage} onChange={(e) => handleInfoChange("fillPercentage", Number(e.target.value))}>
                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* PARAMETERS TABLE */}
        <div className="table-container">
          <table className="score-table">
            <thead>
              <tr>
                <th>{t.parameter}</th>
                <th style={{ textAlign: "center" }}>{t.weight}</th>
                <th style={{ textAlign: "center" }}>{t.score}</th>
                <th style={{ textAlign: "center" }}>{t.weightedScore}</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_PARAMETERS.map((param) => {
                const currentWeight = Number(weights[param.key] ?? param.defaultWeight);
                const currentScore = Number(scores[param.key] ?? 1);
                const weighted = +(currentWeight * currentScore).toFixed(2);
                return (
                  <tr key={param.key}>
                    <td>
                      <div className="param-name">{t[param.key]}</div>
                      <div className="param-desc">{t[`${param.key}Desc`] || ""}</div>
                    </td>
                    <td className="text-center">
                      <select className="weight-select" value={currentWeight} onChange={(e) => handleWeightChange(param.key, e.target.value)}>
                        {[0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].map((v) => (
                          <option key={v} value={v}>
                            {v.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center">
                      <select className="score-select" value={currentScore} onChange={(e) => handleScoreChange(param.key, e.target.value)}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center">{weighted.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4">
                  <div className="weights-footer-inline">
                    <div className="weights-summary">
                      <strong>Sum:</strong>
                      <span className="weights-sum-value"> {Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0).toFixed(2)}</span>
                    </div>
                    <div className="weights-actions">
                      <label style={{ marginRight: 6 }}>{t.presetsLabel}:</label>
                      <button className="btn-small" onClick={() => setPreset("balanced")}>
                        {t.presetBalanced}
                      </button>
                      <button className="btn-small" onClick={() => setPreset("quality")}>
                        {t.presetQuality}
                      </button>
                      <button className="btn-small" onClick={() => setPreset("speed")}>
                        {t.presetSpeed}
                      </button>
                      <button className="btn-small" onClick={normalizeWeights}>
                        {t.normalize}
                      </button>
                      <button className="btn-primary" onClick={handleSaveResults} style={{ marginLeft: 8 }}>
                        {t.saveResults}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* RESULTS / RECOMMENDATIONS */}
        <div className="results-container">
          <div className="score-card" style={{ backgroundColor: `${getQualityColor(finalScore)}15` }}>
            <div>
              <h3>{t.finalScore}</h3>
              <p className="final-score" style={{ color: getQualityColor(finalScore) }}>
                {finalScore.toFixed(2)}
              </p>
              <p className="quality-level" style={{ color: getQualityColor(finalScore) }}>
                {getQualityLevel(finalScore)}
              </p>
            </div>
            <div className="button-group">
              <button className="btn-success" onClick={generateSelectedPDF}>
                {t.generateSelectedPdf}
              </button>
              <button className="btn-small" onClick={generateSelectedTable}>
                {t.generateSelectedTable}
              </button>
              <button
                className="btn-warning"
                onClick={() => {
                  setScores(DEFAULT_PARAMETERS.reduce((acc, p) => ({ ...acc, [p.key]: 1 }), {}));
                  setHistoryData([]);
                  showToast(language === "pt" ? "Formulário zerado" : "Form reset", 2500);
                  setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
                }}
              >
                {t.resetResults}
              </button>
            </div>
          </div>

          <div className="recommendations-card">
            <h3>{t.recommendationsTitle}</h3>
            <ul>
              {scores.structuralQuality < 3 && <li>{t.rec_check_cohesion}</li>}
              {scores.layerAdhesion < 3 && <li>{t.rec_increase_temp}</li>}
              {scores.extrusionConsistency < 3 && <li>{t.rec_check_homogeneity}</li>}
              <li>{t.rec_calibrate_scale}</li>
              <li>{t.rec_retract_params}</li>
              <li>{t.rec_calibrate_precision}</li>
            </ul>
          </div>
        </div>

        {/* HISTORY */}
        {historyData.length > 0 && (
          <div className="history-section">
            <div className="history-actions" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <button
                className="btn-small"
                onClick={async () => {
                  if (!window.confirm(language === 'pt' ? 'Deseja limpar arquivos de imagens não referenciadas?' : 'Do you want to delete unreferenced image files?')) return;
                  if (window.electron && typeof window.electron.cleanupUnusedPhotos === 'function') {
                    const res = await window.electron.cleanupUnusedPhotos();
                    if (res && res.success) {
                      showToast((language === 'pt' ? `Arquivos removidos: ${res.removed?.length || 0}` : `Removed files: ${res.removed?.length || 0}`), 5000);
                    } else {
                      showToast((language === 'pt' ? 'Erro ao limpar arquivos' : 'Cleanup error') + (res?.error ? ': ' + res.error : ''), 5000);
                    }
                  } else {
                    showToast(language === 'pt' ? 'Funcionalidade não disponível' : 'Feature not available', 3000);
                  }
                }}
              >
                {language === 'pt' ? 'Limpar imagens não referenciadas' : 'Cleanup unused images'}
              </button>
              <button className="btn-small" onClick={selectAllSamples}>
                {t.selectAll}
              </button>
              <button className="btn-small" onClick={clearSelectedSamples}>
                {t.clearSelection}
              </button>
              <div style={{ width: 12 }} />
              <button className="btn-primary" onClick={generateSelectedPDF}>
                {t.generateSelectedPdf}
              </button>
              <button className="btn-small" onClick={generateSelectedTable}>
                {t.generateSelectedTable}
              </button>
              <button
                className="btn-small"
                onClick={() => {
                  const selected = historyData.filter((h) => selectedSamples.has(h.sampleCode));
                  if (!selected.length) {
                    showToast(language === "pt" ? "Nenhuma amostra selecionada." : "No samples selected.", 3000);
                    setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
                    return;
                  }
                  setSelectedChartData(selected);
                  setShowSelectedChart(true);
                }}
              >
                {t.showSelectedGraph}
              </button>
            </div>

            <h3>{t.sampleHistory}</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={showSelectedChart ? selectedChartData : historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sampleCode" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
              {showSelectedChart && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn-small"
                    onClick={() => {
                      setShowSelectedChart(false);
                      setSelectedChartData([]);
                      setTimeout(() => sampleCodeRef.current?.focus?.(), 120);
                    }}
                  >
                    {language === "pt" ? "Fechar gráfico selecionado" : "Close selected chart"}
                  </button>
                </div>
              )}
            </div>

            <div className="table-container" style={{ width: '100%', overflowX: 'auto' }}>
              <table className="history-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th></th>
                    <th>{t.sampleCode || 'Code'}</th>
                    <th>{t.date || 'Date'}</th>
                    <th>{t.ingredients || 'Ingredients'}</th>
                    <th>{t.patternCol || 'Pattern'}</th>
                    <th>{t.fillCol || 'Fill'}</th>
                    <th>{t.speedCol || 'Speed'}</th>
                    <th>{t.flowCol || 'Flow'}</th>
                    <th>{t.nozzleCol || 'Nozzle'}</th>
                    <th>{t.scoreCol || 'Score'}</th>
                    <th>{t.qualityCol || 'Quality'}</th>
                    <th className="actions-cell"> {/* header cell sticky too */}
                      {language === 'pt' ? 'Ações' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((entry, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSamples.has(idx)}
                          onChange={() => {
                            const next = new Set(selectedSamples);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            setSelectedSamples(next);
                          }}
                        />
                      </td>

                      <td>{entry.sampleCode}</td>
                      <td>{entry.date}</td>

                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.ingredients || '-'}
                      </td>

                      <td>{translations[language]?.patterns?.[entry.patternKey] || entry.patternKey}</td>
                      <td>{entry.fill != null ? `${entry.fill}%` : '-'}</td>
                      <td>{entry.printingSpeed ?? entry.speed ?? '-'}</td>
                      <td>{entry.flowRate ?? entry.flow ?? '-'}</td>
                      <td>{entry.nozzleSize ? `${entry.nozzleSize} mm` : (entry.nozzle || '-')}</td>

                      <td style={{ fontWeight: 700 }}>{Number(entry.score || 0).toFixed(2)}</td>
                      <td style={{ color: getQualityColor(entry.score || 0) }}>{getQualityLevel(entry.score || 0)}</td>

                      {/* ACTIONS CELL (sticky + fallback inline styles) */}
                      <td
                        className="actions-cell"
                        style={{
                          position: 'sticky',
                          right: 0,
                          zIndex: 3,
                          background: '#fff',
                          boxShadow: '-6px 0 8px -6px rgba(0,0,0,0.06)',
                          whiteSpace: 'nowrap',
                          paddingLeft: 8,
                          paddingRight: 8,
                          textAlign: 'center',
                          minWidth: 120,
                        }}
                      >
                        {/* thumbnail (if present) */}
                        {entry.photoThumbPath ? (
                          <img
                            className="thumb"
                            src={`file://${entry.photoThumbPath}`}
                            alt="thumb"
                            style={{ maxWidth: 110, display: 'block', margin: '0 auto 6px' }}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'assets/thumb-placeholder.png'; }}
                          />
                        ) : (
                          <div style={{ height: 60 }} />
                        )}

                        {/* view original button */}
                        {entry.photoPath && (
                          <button
                            title={language === 'pt' ? 'Visualizar original' : 'View original'}
                            className="btn-small"
                            onClick={() => openImageOriginal(entry.photoPath)}
                            style={{ marginRight: 6 }}
                          >
                            🔍
                          </button>
                        )}

                        {/* delete */}
                        <button
                          title={t.delete || 'Delete'}
                          className="btn-delete"
                          onClick={() => handleDeleteResult(idx)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>

      {/* Toast (non-blocking) */}
      {toast.show && (
        <div className="app-toast" role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default QualityCalculator;
