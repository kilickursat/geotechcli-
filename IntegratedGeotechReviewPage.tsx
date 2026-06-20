'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type StratumClass = 'made' | 'clay' | 'sand' | 'gravel';
type FieldType = 'header' | 'strata' | 'spt' | 'water';
type EvidenceFilter = FieldType | 'all';
type ViewId = 'review' | 'geo' | 'validation';

type Stratum = {
  top: number;
  base: number;
  name: string;
  description: string;
  className: StratumClass;
  confidence: number;
  status: 'accepted' | 'review_recommended';
  evidence: string;
};

type Borehole = {
  id: string;
  sourcePage: number;
  easting: number;
  northing: number;
  lat: number;
  lon: number;
  groundLevel: number;
  totalDepth: number;
  chainage: number;
  offset: number;
  confidence: number;
  evidence: {
    id: string;
    coords: string;
    gl: string;
    td: string;
  };
  strata: Stratum[];
  spt: { depth: number; n: number; confidence: number; evidence: string }[];
  groundwater: { depth: number; type: string; confidence: number; evidence: string }[];
};

type IntegratedModel = {
  schemaVersion: string;
  run: {
    id: string;
    document: string;
    documentHash: string;
    providerProfile: string;
    models: { ocr: string; vision: string; text: string };
    status: string;
  };
  project: {
    name: string;
    country: string;
    site: string;
    inputCrs: string;
    inputCrsName: string;
    displayCrs: string;
    displayCrsName: string;
    verticalDatum: string;
    crsTransformEngine: string;
  };
  quality: {
    overallConfidence: number;
    evidenceCoverage: number;
    depthMappingR2: number;
    warnings: string[];
  };
  boreholes: Borehole[];
};

type Field = {
  id: string;
  type: FieldType;
  title: string;
  value: string;
  conf: number;
  status: 'accepted' | 'review';
  model: string;
};

const model: IntegratedModel = {
  "schemaVersion": "geotech.integrated_review.v1",
  "run": {
    "id": "run_demo_2026_05_11_001",
    "document": "Metro_Extension_GI_Report.pdf",
    "documentHash": "sha256:demo-integrated",
    "providerProfile": "glm_default",
    "models": {
      "ocr": "glm-ocr",
      "vision": "glm-5v-turbo",
      "text": "glm-5.2"
    },
    "status": "review_recommended"
  },
  "project": {
    "name": "Metro Extension Package A",
    "country": "United Kingdom",
    "site": "London demo corridor",
    "inputCrs": "EPSG:27700",
    "inputCrsName": "OSGB36 / British National Grid",
    "displayCrs": "EPSG:4326",
    "displayCrsName": "WGS84 latitude/longitude",
    "verticalDatum": "mAOD",
    "crsTransformEngine": "pyproj"
  },
  "quality": {
    "overallConfidence": 0.87,
    "evidenceCoverage": 1.0,
    "depthMappingR2": 0.998,
    "warnings": [
      "LOW_CONFIDENCE_STRATA_BOUNDARY",
      "GROUNDWATER_SYMBOL_REVIEW",
      "DATUM_TRANSFORM_VERIFY"
    ]
  },
  "boreholes": [
    {
      "id": "BH-01",
      "sourcePage": 10,
      "easting": 526020.0,
      "northing": 182890.0,
      "lat": 51.53086366,
      "lon": -0.18463393,
      "groundLevel": 14.6,
      "totalDepth": 11.0,
      "chainage": 0,
      "offset": -7,
      "confidence": 0.88,
      "evidence": {
        "id": "ev_BH01_id",
        "coords": "ev_BH01_coords",
        "gl": "ev_BH01_gl",
        "td": "ev_BH01_td"
      },
      "strata": [
        {
          "top": 0.0,
          "base": 1.0,
          "name": "Made Ground",
          "description": "MADE GROUND: sandy gravelly clay with brick fragments.",
          "className": "made",
          "confidence": 0.91,
          "status": "accepted",
          "evidence": "ev_BH01_layer_0"
        },
        {
          "top": 1.0,
          "base": 4.2,
          "name": "Firm silty CLAY",
          "description": "Firm brown slightly sandy silty CLAY.",
          "className": "clay",
          "confidence": 0.88,
          "status": "accepted",
          "evidence": "ev_BH01_layer_1"
        },
        {
          "top": 4.2,
          "base": 7.7,
          "name": "Medium dense SAND",
          "description": "Medium dense yellow-brown fine to medium SAND.",
          "className": "sand",
          "confidence": 0.86,
          "status": "accepted",
          "evidence": "ev_BH01_layer_2"
        },
        {
          "top": 7.7,
          "base": 11.0,
          "name": "Dense sandy GRAVEL",
          "description": "Dense sandy GRAVEL.",
          "className": "gravel",
          "confidence": 0.79,
          "status": "review_recommended",
          "evidence": "ev_BH01_layer_3"
        }
      ],
      "spt": [
        {
          "depth": 1.5,
          "n": 8,
          "confidence": 0.91,
          "evidence": "ev_BH01_spt_0"
        },
        {
          "depth": 3.0,
          "n": 11,
          "confidence": 0.9,
          "evidence": "ev_BH01_spt_1"
        },
        {
          "depth": 6.0,
          "n": 18,
          "confidence": 0.88,
          "evidence": "ev_BH01_spt_2"
        },
        {
          "depth": 9.0,
          "n": 31,
          "confidence": 0.82,
          "evidence": "ev_BH01_spt_3"
        }
      ],
      "groundwater": [
        {
          "depth": 3.1,
          "type": "water_strike_symbol",
          "confidence": 0.78,
          "evidence": "ev_BH01_water_0"
        }
      ]
    },
    {
      "id": "BH-02",
      "sourcePage": 11,
      "easting": 526090.0,
      "northing": 182930.0,
      "lat": 51.53120752,
      "lon": -0.18361101,
      "groundLevel": 14.25,
      "totalDepth": 10.0,
      "chainage": 82,
      "offset": 2,
      "confidence": 0.89,
      "evidence": {
        "id": "ev_BH02_id",
        "coords": "ev_BH02_coords",
        "gl": "ev_BH02_gl",
        "td": "ev_BH02_td"
      },
      "strata": [
        {
          "top": 0.0,
          "base": 1.2,
          "name": "Made Ground",
          "description": "MADE GROUND: sandy gravelly clay with brick fragments.",
          "className": "made",
          "confidence": 0.93,
          "status": "accepted",
          "evidence": "ev_BH02_layer_0"
        },
        {
          "top": 1.2,
          "base": 4.5,
          "name": "Firm silty CLAY",
          "description": "Firm brown slightly sandy silty CLAY.",
          "className": "clay",
          "confidence": 0.88,
          "status": "accepted",
          "evidence": "ev_BH02_layer_1"
        },
        {
          "top": 4.5,
          "base": 7.9,
          "name": "Medium dense SAND",
          "description": "Medium dense yellow-brown fine to medium SAND.",
          "className": "sand",
          "confidence": 0.86,
          "status": "accepted",
          "evidence": "ev_BH02_layer_2"
        },
        {
          "top": 7.9,
          "base": 10.0,
          "name": "Dense sandy GRAVEL",
          "description": "Dense sandy GRAVEL. Boundary flagged for review.",
          "className": "gravel",
          "confidence": 0.74,
          "status": "review_recommended",
          "evidence": "ev_BH02_layer_3"
        }
      ],
      "spt": [
        {
          "depth": 1.5,
          "n": 8,
          "confidence": 0.92,
          "evidence": "ev_BH02_spt_0"
        },
        {
          "depth": 3.0,
          "n": 12,
          "confidence": 0.91,
          "evidence": "ev_BH02_spt_1"
        },
        {
          "depth": 6.5,
          "n": 18,
          "confidence": 0.89,
          "evidence": "ev_BH02_spt_2"
        },
        {
          "depth": 8.5,
          "n": 32,
          "confidence": 0.84,
          "evidence": "ev_BH02_spt_3"
        }
      ],
      "groundwater": [
        {
          "depth": 3.05,
          "type": "water_strike_symbol",
          "confidence": 0.76,
          "evidence": "ev_BH02_water_0"
        }
      ]
    },
    {
      "id": "BH-03",
      "sourcePage": 12,
      "easting": 526170.0,
      "northing": 182975.0,
      "lat": 51.53159408,
      "lon": -0.18244221,
      "groundLevel": 13.85,
      "totalDepth": 12.0,
      "chainage": 176,
      "offset": -3,
      "confidence": 0.88,
      "evidence": {
        "id": "ev_BH03_id",
        "coords": "ev_BH03_coords",
        "gl": "ev_BH03_gl",
        "td": "ev_BH03_td"
      },
      "strata": [
        {
          "top": 0.0,
          "base": 0.8,
          "name": "Made Ground",
          "description": "MADE GROUND: brown sandy gravelly clay with brick fragments.",
          "className": "made",
          "confidence": 0.9,
          "status": "accepted",
          "evidence": "ev_BH03_layer_0"
        },
        {
          "top": 0.8,
          "base": 3.8,
          "name": "Firm silty CLAY",
          "description": "Firm brown slightly sandy silty CLAY.",
          "className": "clay",
          "confidence": 0.86,
          "status": "accepted",
          "evidence": "ev_BH03_layer_1"
        },
        {
          "top": 3.8,
          "base": 8.4,
          "name": "Medium dense SAND",
          "description": "Medium dense yellow-brown fine to medium SAND.",
          "className": "sand",
          "confidence": 0.87,
          "status": "accepted",
          "evidence": "ev_BH03_layer_2"
        },
        {
          "top": 8.4,
          "base": 12.0,
          "name": "Dense sandy GRAVEL",
          "description": "Dense sandy GRAVEL. Boundary verified by GLM-5V crop.",
          "className": "gravel",
          "confidence": 0.82,
          "status": "accepted",
          "evidence": "ev_BH03_layer_3"
        }
      ],
      "spt": [
        {
          "depth": 1.5,
          "n": 9,
          "confidence": 0.92,
          "evidence": "ev_BH03_spt_0"
        },
        {
          "depth": 3.0,
          "n": 13,
          "confidence": 0.91,
          "evidence": "ev_BH03_spt_1"
        },
        {
          "depth": 6.0,
          "n": 21,
          "confidence": 0.89,
          "evidence": "ev_BH03_spt_2"
        },
        {
          "depth": 10.0,
          "n": 38,
          "confidence": 0.84,
          "evidence": "ev_BH03_spt_3"
        }
      ],
      "groundwater": [
        {
          "depth": 2.75,
          "type": "water_strike_symbol",
          "confidence": 0.79,
          "evidence": "ev_BH03_water_0"
        }
      ]
    },
    {
      "id": "BH-04",
      "sourcePage": 13,
      "easting": 526250.0,
      "northing": 183025.0,
      "lat": 51.53202556,
      "lon": -0.18127159,
      "groundLevel": 13.55,
      "totalDepth": 12.5,
      "chainage": 270,
      "offset": 6,
      "confidence": 0.86,
      "evidence": {
        "id": "ev_BH04_id",
        "coords": "ev_BH04_coords",
        "gl": "ev_BH04_gl",
        "td": "ev_BH04_td"
      },
      "strata": [
        {
          "top": 0.0,
          "base": 0.9,
          "name": "Made Ground",
          "description": "MADE GROUND: sandy gravelly clay.",
          "className": "made",
          "confidence": 0.88,
          "status": "accepted",
          "evidence": "ev_BH04_layer_0"
        },
        {
          "top": 0.9,
          "base": 3.2,
          "name": "Firm silty CLAY",
          "description": "Firm brown slightly sandy silty CLAY.",
          "className": "clay",
          "confidence": 0.83,
          "status": "accepted",
          "evidence": "ev_BH04_layer_1"
        },
        {
          "top": 3.2,
          "base": 8.9,
          "name": "Medium dense SAND",
          "description": "Medium dense yellow-brown fine to medium SAND.",
          "className": "sand",
          "confidence": 0.84,
          "status": "accepted",
          "evidence": "ev_BH04_layer_2"
        },
        {
          "top": 8.9,
          "base": 12.5,
          "name": "Dense sandy GRAVEL",
          "description": "Dense sandy GRAVEL.",
          "className": "gravel",
          "confidence": 0.8,
          "status": "review_recommended",
          "evidence": "ev_BH04_layer_3"
        }
      ],
      "spt": [
        {
          "depth": 1.5,
          "n": 10,
          "confidence": 0.9,
          "evidence": "ev_BH04_spt_0"
        },
        {
          "depth": 3.0,
          "n": 15,
          "confidence": 0.9,
          "evidence": "ev_BH04_spt_1"
        },
        {
          "depth": 6.5,
          "n": 23,
          "confidence": 0.88,
          "evidence": "ev_BH04_spt_2"
        },
        {
          "depth": 10.5,
          "n": 41,
          "confidence": 0.81,
          "evidence": "ev_BH04_spt_3"
        }
      ],
      "groundwater": [
        {
          "depth": 2.4,
          "type": "water_strike_symbol",
          "confidence": 0.77,
          "evidence": "ev_BH04_water_0"
        }
      ]
    }
  ]
};

const css = `
:root{
  --bg:#f6f7f9;--panel:#fff;--ink:#172033;--muted:#697386;--line:#d8dee9;--soft:#eef2f7;
  --good:#1f8f5f;--warn:#b7791f;--bad:#c2410c;--blue:#2563eb;--deep:#0f172a;
  --made:#8b5a2b;--clay:#c98b67;--sand:#f5d77b;--gravel:#a3a3a3;
  --shadow:0 10px 25px rgba(23,32,51,.08);--radius:16px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,select{font:inherit}
header{background:linear-gradient(135deg,#0f172a,#1e293b 55%,#334155);color:#fff;padding:28px 36px}
.header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:22px}
h1{margin:0;font-size:28px;letter-spacing:-.03em}.subtitle{margin-top:8px;color:#cbd5e1;line-height:1.5;max-width:1120px}
.badge-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.badge{display:inline-flex;border-radius:999px;padding:7px 10px;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.16);color:#e5e7eb;font-size:12px;font-weight:750}
.run-card{min-width:315px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:16px;font-size:13px}
.run-card div{display:flex;justify-content:space-between;gap:14px;padding:4px 0;color:#dbeafe}.run-card span:first-child{color:#a7b3c7}
main{padding:24px 28px 42px;max-width:1760px;margin:0 auto}
.summary-grid{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:14px;margin-bottom:16px}
.metric{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}.metric .label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.metric .value{font-size:25px;font-weight:850;letter-spacing:-.04em}.metric .note{color:var(--muted);font-size:12px;margin-top:6px;line-height:1.35}
.status-good{color:var(--good)}.status-warn{color:var(--warn)}.status-blue{color:var(--blue)}.status-bad{color:var(--bad)}
.view-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.nav-btn{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:9px 12px;font-weight:800;font-size:13px;cursor:pointer}.nav-btn:hover{border-color:var(--blue);color:var(--blue)}.nav-btn.active{background:var(--blue);border-color:var(--blue);color:#fff}
.view{display:none}.view.active{display:block}
.panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.panel h2{font-size:16px;margin:0;padding:15px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:center}
.panel h2 small{color:var(--muted);font-weight:500}.panel-body{padding:15px}
.review-grid{display:grid;grid-template-columns:minmax(340px,1.02fr) minmax(340px,.78fr) minmax(380px,1.08fr);gap:16px;align-items:start}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.tool-btn{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:7px 10px;font-weight:750;font-size:12px;cursor:pointer}.tool-btn.active{background:var(--blue);border-color:var(--blue);color:#fff}
.mock-page{position:relative;width:100%;aspect-ratio:.707/1;background:#fff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}
.page-title{position:absolute;left:5%;top:3.2%;width:90%;height:5%;border-bottom:2px solid #111827;font-weight:850;font-size:clamp(12px,1vw,18px);display:flex;align-items:center;justify-content:space-between}
.page-title span:last-child{color:#475569}.page-meta{position:absolute;left:5%;top:9.5%;width:90%;height:8.4%;border:1px solid #94a3b8;display:grid;grid-template-columns:1fr 1fr;font-size:clamp(8px,.62vw,11px)}.page-meta div{padding:4px 6px;border-bottom:1px solid #e2e8f0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.log-frame{position:absolute;left:5%;top:20%;width:90%;height:72%;border:2px solid #334155}.col{position:absolute;top:0;height:100%;border-right:1px solid #64748b}.c-depth{left:0;width:11%}.c-lith{left:11%;width:10%}.c-desc{left:21%;width:38%}.c-sample{left:59%;width:13%}.c-spt{left:72%;width:12%}.c-water{left:84%;width:8%}.c-remarks{left:92%;width:8%;border-right:none}
.col-label{position:absolute;top:0;height:6.2%;width:100%;background:#e2e8f0;border-bottom:1px solid #64748b;font-size:clamp(6px,.55vw,9px);font-weight:800;display:flex;justify-content:center;align-items:center;text-align:center}
.depth-tick{position:absolute;left:0;width:100%;border-top:1px solid #cbd5e1;font-size:clamp(6px,.55vw,9px);color:#334155}.depth-tick span{position:absolute;left:5%;top:-7px;background:#fff;padding-right:2px}
.desc-text{position:absolute;left:23%;width:34%;font-size:clamp(6.5px,.58vw,10px);line-height:1.18;color:#111827;overflow:hidden}
.hatch{position:absolute;left:12%;width:8%;border-left:1px solid #94a3b8;border-right:1px solid #94a3b8;background:repeating-linear-gradient(45deg,rgba(15,23,42,.24) 0 2px,transparent 2px 7px)}
.hatch.made{background:repeating-linear-gradient(135deg,rgba(139,90,43,.55) 0 4px,rgba(139,90,43,.18) 4px 8px)}
.hatch.clay{background:repeating-linear-gradient(45deg,rgba(111,78,55,.3) 0 2px,transparent 2px 7px),#f3d3c1}
.hatch.sand{background:radial-gradient(circle,rgba(15,23,42,.35) 1px,transparent 1.5px) 0 0/8px 8px,#fde68a}
.hatch.gravel{background:radial-gradient(circle,rgba(15,23,42,.35) 1.5px,transparent 2px) 0 0/10px 10px,repeating-linear-gradient(135deg,transparent 0 7px,rgba(15,23,42,.2) 7px 9px),#d4d4d4}
.layer-line{position:absolute;left:11%;width:48%;border-top:2px solid #111827}.layer-line.review{border-top:2px dashed var(--warn)}
.sample-text,.spt-text,.water-text{position:absolute;font-size:clamp(6.5px,.58vw,10px);color:#111827;font-weight:850}.sample-text{left:61%}.spt-text{left:75%}.water-text{left:86%;color:#0369a1}
.evidence-box{position:absolute;border:2px solid var(--blue);background:rgba(37,99,235,.10);border-radius:4px;opacity:.55;cursor:pointer;transition:.15s ease;padding:0}.evidence-box:hover,.evidence-box.active{opacity:1;background:rgba(37,99,235,.18);box-shadow:0 0 0 3px rgba(37,99,235,.16);z-index:20}.evidence-box.warn{border-color:var(--warn);background:rgba(183,121,31,.12)}.hidden-box{display:none!important}
.legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:12px;color:var(--muted)}.legend-item{display:flex;align-items:center;gap:7px}.swatch{width:20px;height:12px;border-radius:3px;border:2px solid var(--blue);background:rgba(37,99,235,.12)}.swatch.warn{border-color:var(--warn);background:rgba(183,121,31,.12)}.swatch.good{border-color:var(--good);background:rgba(31,143,95,.12)}.swatch.bad{border-color:var(--bad);background:rgba(194,65,12,.12)}.swatch.made{background:var(--made);border-color:rgba(15,23,42,.2)}.swatch.clay{background:var(--clay);border-color:rgba(15,23,42,.2)}.swatch.sand{background:var(--sand);border-color:rgba(15,23,42,.2)}.swatch.gravel{background:var(--gravel);border-color:rgba(15,23,42,.2)}
.svg-wrap{display:flex;justify-content:center;background:linear-gradient(#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:13px;padding:8px;overflow:auto}svg text{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.log-highlight{cursor:pointer;transition:.15s ease}.log-highlight.active{filter:drop-shadow(0 0 6px rgba(37,99,235,.72))}
.fields{display:grid;gap:9px;max-height:694px;overflow:auto;padding-right:4px}.field-card{border:1px solid #e2e8f0;border-radius:12px;padding:11px;cursor:pointer;transition:.15s ease;background:#fff}.field-card:hover,.field-card.active{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.12)}.field-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;font-weight:850}.field-value{margin-top:6px;color:#111827;font-size:13.5px;line-height:1.32}.field-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px;color:var(--muted);font-size:12px}
.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#eef2f7;color:#475569;font-size:12px;font-weight:800}.pill.good{background:#dcfce7;color:#166534}.pill.warn{background:#fef3c7;color:#92400e}.pill.bad{background:#ffedd5;color:#9a3412}.pill.blue{background:#dbeafe;color:#1d4ed8}
.confidence{margin-top:9px;height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden}.confidence span{display:block;height:100%;background:linear-gradient(90deg,var(--good),#65a30d)}.confidence span.warn{background:linear-gradient(90deg,var(--warn),#d97706)}.confidence span.bad{background:linear-gradient(90deg,var(--bad),#ef4444)}
.geo-grid{display:grid;grid-template-columns:minmax(520px,1.18fr) minmax(360px,.82fr);gap:16px;align-items:start}.map-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.select-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}select{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:8px 10px;font-weight:800;font-size:12px}
#map{height:420px;width:100%;border:1px solid #d8dee9;border-radius:14px;overflow:hidden;background:#e2e8f0}.map-fallback{display:none;height:420px;border:1px solid #d8dee9;border-radius:14px;background:linear-gradient(90deg,rgba(37,99,235,.08) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(0deg,rgba(37,99,235,.08) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(#f8fafc,#e2e8f0);position:relative;overflow:hidden}.fallback-line{position:absolute;left:13%;top:53%;width:72%;height:4px;background:var(--blue);transform:rotate(28deg);transform-origin:left center;border-radius:99px;opacity:.75}.fallback-point{position:absolute;width:22px;height:22px;border-radius:50%;background:var(--blue);border:3px solid #fff;box-shadow:0 5px 12px rgba(0,0,0,.2);color:white;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:900}
.notice{border:1px solid #fde68a;background:#fffbeb;color:#78350f;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45;margin-top:10px}.selected-panel{border:1px solid #dbeafe;border-radius:14px;background:#eff6ff;padding:13px;margin-bottom:11px}.selected-panel strong{font-size:18px}.selected-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;font-size:13px;color:#334155}.crs-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.crs-box{border:1px solid #e2e8f0;border-radius:12px;padding:11px;background:#f8fafc}.crs-box .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}.crs-box .v{font-weight:850}.crs-box .s{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.35}
.section-panel{margin-top:16px}.cross-section-wrap{overflow:auto;background:linear-gradient(#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:14px;padding:8px}.bh-log{cursor:pointer;transition:.15s ease}.bh-log.active{filter:drop-shadow(0 0 8px rgba(37,99,235,.75))}
.data-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{color:#475569;background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em}code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px}
.tabs{display:flex;gap:8px;padding:0 15px 13px;border-bottom:1px solid var(--line);flex-wrap:wrap}.tab{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:7px 10px;font-weight:800;font-size:12px;cursor:pointer}.tab.active{background:var(--blue);border-color:var(--blue);color:#fff}.tab-content{display:none}.tab-content.active{display:block}
.warning-list{display:grid;gap:10px}.warning{border-left:4px solid var(--warn);background:#fffbeb;border-radius:10px;padding:12px;color:#78350f;font-size:13px}.warning.bad{border-left-color:var(--bad);background:#fff7ed;color:#7c2d12}
.pipeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:12px;padding:10px}.num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#dbeafe;color:#1d4ed8;font-weight:900}.step strong{display:block}.step small{color:var(--muted)}
pre{background:#0f172a;color:#e2e8f0;border-radius:12px;padding:14px;overflow:auto;font-size:12px;line-height:1.45;max-height:520px}.small-muted{color:var(--muted);font-size:12px;line-height:1.45}.leaflet-popup-content{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.popup-title{font-weight:900;font-size:14px;margin-bottom:5px}.popup-row{font-size:12px;color:#334155;margin:2px 0}
@media(max-width:1400px){.review-grid,.geo-grid,.data-grid,.footer-grid{grid-template-columns:1fr}.fields{max-height:none}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.header-top{flex-direction:column}.run-card{min-width:0;width:100%}}
@media(max-width:720px){main{padding:16px}header{padding:22px 18px}.summary-grid,.crs-card{grid-template-columns:1fr}.metric .value{font-size:22px}.review-grid{gap:12px}.panel h2{align-items:flex-start;flex-direction:column}.legend{display:grid;grid-template-columns:1fr}.mock-page{min-height:560px}.page-meta{font-size:8px}}
`;

const classColors: Record<StratumClass, string> = {
  made: '#8b5a2b',
  clay: '#c98b67',
  sand: '#f5d77b',
  gravel: '#a3a3a3',
};

const sectionPattern: Record<StratumClass, string> = {
  made: 'madePattern',
  clay: 'clayPattern',
  sand: 'sandPattern',
  gravel: 'gravelPattern',
};

function pct(value: number) {
  return Math.round(value * 100);
}

function fmt(value: number, digits = 2) {
  return Number(value).toFixed(digits);
}

function yPct(depth: number, totalDepth: number) {
  return 7 + (depth / totalDepth) * 91;
}

function statusClass(status: string) {
  if (status === 'accepted') return 'good';
  if (status === 'review' || status === 'review_recommended') return 'warn';
  return 'bad';
}

function getBorehole(id: string): Borehole {
  return model.boreholes.find((borehole) => borehole.id === id) ?? model.boreholes[0];
}

function buildFields(borehole: Borehole): Field[] {
  const fields: Field[] = [
    {
      id: borehole.evidence.id,
      type: 'header',
      title: 'Borehole ID',
      value: borehole.id,
      conf: 0.96,
      status: 'accepted',
      model: 'GLM-OCR + GLM-5.1',
    },
    {
      id: borehole.evidence.gl,
      type: 'header',
      title: 'Ground level',
      value: `${fmt(borehole.groundLevel)} ${model.project.verticalDatum}`,
      conf: 0.91,
      status: 'accepted',
      model: 'GLM-OCR',
    },
    {
      id: borehole.evidence.td,
      type: 'header',
      title: 'Final depth',
      value: `${fmt(borehole.totalDepth)} m bgl`,
      conf: 0.93,
      status: 'accepted',
      model: 'GLM-OCR',
    },
    {
      id: borehole.evidence.coords,
      type: 'header',
      title: 'Coordinates',
      value: `E ${fmt(borehole.easting)} / N ${fmt(borehole.northing)} (${model.project.inputCrs})`,
      conf: 0.88,
      status: 'accepted',
      model: 'GLM-OCR + CRS validator',
    },
  ];

  borehole.strata.forEach((stratum, index) => {
    fields.push({
      id: stratum.evidence,
      type: 'strata',
      title: `Stratum ${index + 1}`,
      value: `${fmt(stratum.top)}-${fmt(stratum.base)} m | ${stratum.description}`,
      conf: stratum.confidence,
      status: stratum.status === 'accepted' ? 'accepted' : 'review',
      model: 'OCR + depth map',
    });
  });

  borehole.spt.forEach((spt) => {
    fields.push({
      id: spt.evidence,
      type: 'spt',
      title: 'SPT',
      value: `N=${spt.n} at ${fmt(spt.depth)} m`,
      conf: spt.confidence,
      status: 'accepted',
      model: 'OCR + geometry',
    });
  });

  borehole.groundwater.forEach((water) => {
    fields.push({
      id: water.evidence,
      type: 'water',
      title: 'Groundwater',
      value: `${water.type.replaceAll('_', ' ')} at ${fmt(water.depth)} m`,
      conf: water.confidence,
      status: 'review',
      model: 'GLM-5V symbol check',
    });
  });

  return fields;
}

function AppStyles() {
  return <style>{css}</style>;
}

function SummaryCards() {
  return (
    <section className="summary-grid">
      <div className="metric">
        <div className="label">Overall confidence</div>
        <div className="value status-warn">{pct(model.quality.overallConfidence)}%</div>
        <div className="note">Borehole extraction confidence after validation.</div>
      </div>
      <div className="metric">
        <div className="label">Evidence coverage</div>
        <div className="value status-good">{pct(model.quality.evidenceCoverage)}%</div>
        <div className="note">Every rendered value has source evidence.</div>
      </div>
      <div className="metric">
        <div className="label">Boreholes</div>
        <div className="value status-blue">{model.boreholes.length}</div>
        <div className="note">Mapped and included in A-A′ section.</div>
      </div>
      <div className="metric">
        <div className="label">CRS</div>
        <div className="value status-good">{model.project.inputCrs}</div>
        <div className="note">Transformed to {model.project.displayCrs} for mapping.</div>
      </div>
      <div className="metric">
        <div className="label">Depth mapping</div>
        <div className="value status-good">R² {model.quality.depthMappingR2}</div>
        <div className="note">Deterministic y-coordinate to depth calibration.</div>
      </div>
    </section>
  );
}

function SourceReportPage({
  borehole,
  selectedEvidenceId,
  evidenceFilter,
  onEvidenceSelect,
}: {
  borehole: Borehole;
  selectedEvidenceId: string;
  evidenceFilter: EvidenceFilter;
  onEvidenceSelect: (id: string) => void;
}) {
  const ticks = Array.from({ length: Math.ceil(borehole.totalDepth) + 1 }, (_, depth) => depth);
  const visible = (type: EvidenceFilter) => evidenceFilter === 'all' || evidenceFilter === type;

  const boxClass = (id: string, type: FieldType, tone?: 'warn') =>
    [
      'evidence-box',
      tone ?? '',
      selectedEvidenceId === id ? 'active' : '',
      visible(type) ? '' : 'hidden-box',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="mock-page" aria-label="Extracted source borehole log page">
      <div className="page-title">
        <span>GROUND INVESTIGATION LOG</span>
        <span>{borehole.id}</span>
      </div>

      <div className="page-meta">
        <div>Project: {model.project.name}</div>
        <div>Exploratory Hole: {borehole.id}</div>
        <div>
          Ground Level: {fmt(borehole.groundLevel)} {model.project.verticalDatum}
        </div>
        <div>Final Depth: {fmt(borehole.totalDepth)} m bgl</div>
        <div>E: {fmt(borehole.easting)}</div>
        <div>N: {fmt(borehole.northing)}</div>
      </div>

      <button
        className={boxClass(borehole.evidence.id, 'header')}
        data-id={borehole.evidence.id}
        type="button"
        title="Borehole ID evidence"
        style={{ left: '63%', top: '10.2%', width: '22%', height: '3.8%' }}
        onClick={() => onEvidenceSelect(borehole.evidence.id)}
      />
      <button
        className={boxClass(borehole.evidence.gl, 'header')}
        data-id={borehole.evidence.gl}
        type="button"
        title="Ground level evidence"
        style={{ left: '5.5%', top: '14.1%', width: '38%', height: '3.2%' }}
        onClick={() => onEvidenceSelect(borehole.evidence.gl)}
      />
      <button
        className={boxClass(borehole.evidence.td, 'header')}
        data-id={borehole.evidence.td}
        type="button"
        title="Total depth evidence"
        style={{ left: '50.5%', top: '14.1%', width: '38%', height: '3.2%' }}
        onClick={() => onEvidenceSelect(borehole.evidence.td)}
      />
      <button
        className={boxClass(borehole.evidence.coords, 'header')}
        data-id={borehole.evidence.coords}
        type="button"
        title="Coordinate evidence"
        style={{ left: '5.5%', top: '16.7%', width: '83%', height: '2%' }}
        onClick={() => onEvidenceSelect(borehole.evidence.coords)}
      />

      <div className="log-frame">
        <div className="col c-depth">
          <div className="col-label">
            Depth
            <br />m
          </div>
        </div>
        <div className="col c-lith">
          <div className="col-label">Legend</div>
        </div>
        <div className="col c-desc">
          <div className="col-label">Strata description</div>
        </div>
        <div className="col c-sample">
          <div className="col-label">Sample</div>
        </div>
        <div className="col c-spt">
          <div className="col-label">SPT</div>
        </div>
        <div className="col c-water">
          <div className="col-label">Water</div>
        </div>
        <div className="col c-remarks">
          <div className="col-label">Remarks</div>
        </div>

        {ticks.map((depth) => (
          <div className="depth-tick" key={depth} style={{ top: `${yPct(depth, borehole.totalDepth)}%` }}>
            <span>{depth}</span>
          </div>
        ))}

        {borehole.strata.map((stratum) => {
          const top = yPct(stratum.top, borehole.totalDepth);
          const bottom = yPct(stratum.base, borehole.totalDepth);
          const height = bottom - top;
          const review = stratum.status !== 'accepted';

          return (
            <React.Fragment key={stratum.evidence}>
              <div className={`hatch ${stratum.className}`} style={{ top: `${top}%`, height: `${height}%` }} />
              <div className={`layer-line ${review ? 'review' : ''}`} style={{ top: `${bottom}%` }} />
              <div className="desc-text" style={{ top: `${top + 1}%`, height: `${Math.max(4, height - 1)}%` }}>
                {stratum.description}
              </div>
              <button
                className={boxClass(stratum.evidence, 'strata', review ? 'warn' : undefined)}
                data-id={stratum.evidence}
                type="button"
                title={`${stratum.name} evidence`}
                style={{
                  left: '23%',
                  top: `${top + 0.7}%`,
                  width: '34%',
                  height: `${Math.max(4.2, Math.min(8, height - 1))}%`,
                }}
                onClick={() => onEvidenceSelect(stratum.evidence)}
              />
            </React.Fragment>
          );
        })}

        {borehole.spt.map((spt) => {
          const top = yPct(spt.depth, borehole.totalDepth);
          return (
            <React.Fragment key={spt.evidence}>
              <div className="spt-text" style={{ top: `${top - 0.7}%` }}>
                N={spt.n}
              </div>
              <button
                className={boxClass(spt.evidence, 'spt')}
                data-id={spt.evidence}
                type="button"
                title={`SPT N=${spt.n}`}
                style={{ left: '72.5%', top: `${top - 1.2}%`, width: '10.5%', height: '2.6%' }}
                onClick={() => onEvidenceSelect(spt.evidence)}
              />
            </React.Fragment>
          );
        })}

        {borehole.groundwater.map((water) => {
          const top = yPct(water.depth, borehole.totalDepth);
          return (
            <React.Fragment key={water.evidence}>
              <div className="water-text" style={{ top: `${top - 0.9}%` }}>
                ▽
              </div>
              <button
                className={boxClass(water.evidence, 'water', 'warn')}
                data-id={water.evidence}
                type="button"
                title="Groundwater symbol"
                style={{ left: '84.7%', top: `${top - 1.3}%`, width: '6.8%', height: '3%' }}
                onClick={() => onEvidenceSelect(water.evidence)}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StripLog({
  borehole,
  selectedEvidenceId,
  onEvidenceSelect,
}: {
  borehole: Borehole;
  selectedEvidenceId: string;
  onEvidenceSelect: (id: string) => void;
}) {
  const top = 82;
  const height = 560;
  const y = (depth: number) => top + (depth / borehole.totalDepth) * height;
  const ticks = Array.from({ length: Math.ceil(borehole.totalDepth) + 1 }, (_, depth) => depth);

  return (
    <svg width="430" height="720" viewBox="0 0 430 720" role="img" aria-label="Rendered borehole log">
      <defs>
        <pattern id="strip-made" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#8b5a2b" opacity=".75" />
          <path d="M0 10 L12 0" stroke="#6b3f1d" strokeWidth="2" opacity=".5" />
        </pattern>
        <pattern id="strip-clay" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#f3d3c1" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#8a4d33" strokeWidth="2" opacity=".55" />
        </pattern>
        <pattern id="strip-sand" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#f5d77b" />
          <circle cx="2" cy="2" r="1.2" fill="#8a6a10" />
          <circle cx="7" cy="6" r="1.2" fill="#8a6a10" />
        </pattern>
        <pattern id="strip-gravel" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#d4d4d4" />
          <circle cx="4" cy="5" r="2" fill="#64748b" />
          <circle cx="10" cy="10" r="2.4" fill="#64748b" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="430" height="720" rx="14" fill="#ffffff" />
      <text x="20" y="32" fontSize="18" fontWeight="850" fill="#111827">
        {borehole.id}
      </text>
      <text x="20" y="52" fontSize="12" fill="#64748b">
        GL {fmt(borehole.groundLevel)} {model.project.verticalDatum} | TD {fmt(borehole.totalDepth)} m bgl | Page{' '}
        {borehole.sourcePage}
      </text>

      <line x1="72" y1={top} x2="72" y2={top + height} stroke="#334155" strokeWidth="2" />
      <line x1="260" y1={top} x2="260" y2={top + height} stroke="#334155" strokeWidth="2" />
      <line x1="320" y1={top} x2="320" y2={top + height} stroke="#334155" strokeWidth="2" />
      <line x1="388" y1={top} x2="388" y2={top + height} stroke="#334155" strokeWidth="2" />

      <text x="24" y="78" fontSize="11" fontWeight="850" fill="#334155">Depth</text>
      <text x="118" y="78" fontSize="11" fontWeight="850" fill="#334155">Strata</text>
      <text x="275" y="78" fontSize="11" fontWeight="850" fill="#334155">SPT N</text>
      <text x="335" y="78" fontSize="11" fontWeight="850" fill="#334155">Water</text>

      {ticks.map((depth) => {
        const yy = y(depth);
        return (
          <g key={depth}>
            <text x="30" y={yy + 4} fontSize="10" fill="#475569">{depth}</text>
            <line x1="52" y1={yy} x2="388" y2={yy} stroke={depth === 0 || depth === ticks.length - 1 ? '#334155' : '#e2e8f0'} />
          </g>
        );
      })}

      {borehole.strata.map((stratum) => {
        const yy = y(stratum.top);
        const segmentHeight = Math.max(2, y(stratum.base) - y(stratum.top));
        const review = stratum.status !== 'accepted';

        return (
          <g
            key={stratum.evidence}
            className={`log-highlight ${selectedEvidenceId === stratum.evidence ? 'active' : ''}`}
            data-id={stratum.evidence}
            onClick={() => onEvidenceSelect(stratum.evidence)}
          >
            <rect
              x="72"
              y={yy}
              width="188"
              height={segmentHeight}
              fill={`url(#strip-${stratum.className})`}
              stroke={review ? '#b7791f' : '#111827'}
              strokeWidth="1.5"
              strokeDasharray={review ? '7 5' : undefined}
            />
            <text x="84" y={yy + Math.min(30, segmentHeight / 2)} fontSize="11" fill="#111827">
              {stratum.name}
            </text>
            <text x="84" y={yy + Math.min(46, segmentHeight / 2 + 16)} fontSize="10" fill="#475569">
              {fmt(stratum.top)} - {fmt(stratum.base)} m
            </text>
          </g>
        );
      })}

      {borehole.spt.map((spt) => (
        <g
          key={spt.evidence}
          className={`log-highlight ${selectedEvidenceId === spt.evidence ? 'active' : ''}`}
          data-id={spt.evidence}
          onClick={() => onEvidenceSelect(spt.evidence)}
        >
          <circle cx="290" cy={y(spt.depth)} r="9" fill="#dbeafe" stroke="#1d4ed8" />
          <text x="306" y={y(spt.depth) + 4} fontSize="12" fill="#111827">
            {spt.n}
          </text>
        </g>
      ))}

      {borehole.groundwater.map((water) => (
        <g
          key={water.evidence}
          className={`log-highlight ${selectedEvidenceId === water.evidence ? 'active' : ''}`}
          data-id={water.evidence}
          onClick={() => onEvidenceSelect(water.evidence)}
        >
          <path d={`M346 ${y(water.depth) - 6} l18 0 l-9 15 z`} fill="#bae6fd" stroke="#0369a1" strokeWidth="2" />
          <text x="334" y={y(water.depth) + 30} fontSize="10" fill="#0369a1">
            {fmt(water.depth)} m
          </text>
        </g>
      ))}

      <rect x="20" y="668" width="390" height="34" rx="10" fill="#f8fafc" stroke="#e2e8f0" />
      <text x="34" y="689" fontSize="11" fill="#475569">
        Rendered from validated JSON; dashed boundaries require review.
      </text>
    </svg>
  );
}

function FieldsPanel({
  borehole,
  selectedEvidenceId,
  onEvidenceSelect,
}: {
  borehole: Borehole;
  selectedEvidenceId: string;
  onEvidenceSelect: (id: string) => void;
}) {
  const fields = buildFields(borehole);

  return (
    <div className="fields">
      {fields.map((field) => {
        const barClass = field.conf >= 0.85 ? '' : field.conf >= 0.7 ? 'warn' : 'bad';

        return (
          <div
            key={field.id}
            className={`field-card ${selectedEvidenceId === field.id ? 'active' : ''}`}
            data-id={field.id}
            data-type={field.type}
            role="button"
            tabIndex={0}
            onClick={() => onEvidenceSelect(field.id)}
          >
            <div className="field-title">
              <span>{field.title}</span>
              <span className={`pill ${statusClass(field.status)}`}>{field.status === 'accepted' ? 'accepted' : 'review'}</span>
            </div>
            <div className="field-value">{field.value}</div>
            <div className="field-meta">
              <span>{pct(field.conf)}% confidence</span>
              <span>{field.id}</span>
              <span>{field.model}</span>
            </div>
            <div className="confidence">
              <span className={barClass} style={{ width: `${pct(field.conf)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeafletMap({
  selectedBhId,
  active,
  onSelectBorehole,
}: {
  selectedBhId: string;
  active: boolean;
  onSelectBorehole: (id: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || failed || mapInstanceRef.current) return;

    let cancelled = false;

    async function loadMap() {
      try {
        const L: any = await import('leaflet');
        if (cancelled || !mapRef.current) return;

        const map = L.map(mapRef.current, { scrollWheelZoom: false });
        mapInstanceRef.current = map;

        const latlngs = model.boreholes.map((borehole) => [borehole.lat, borehole.lon]);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 20,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        polylineRef.current = L.polyline(latlngs, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8,
        }).addTo(map);

        model.boreholes.forEach((borehole) => {
          const marker = L.circleMarker([borehole.lat, borehole.lon], {
            radius: borehole.id === selectedBhId ? 10 : 8,
            color: '#fff',
            weight: 3,
            fillColor: borehole.id === selectedBhId ? '#1d4ed8' : '#2563eb',
            fillOpacity: 0.95,
          }).addTo(map);

          marker.bindPopup(`
            <div class="popup-title">${borehole.id}</div>
            <div class="popup-row">E/N: ${fmt(borehole.easting)} / ${fmt(borehole.northing)}</div>
            <div class="popup-row">Lat/Lon: ${borehole.lat.toFixed(6)} / ${borehole.lon.toFixed(6)}</div>
            <div class="popup-row">GL: ${fmt(borehole.groundLevel)} m | TD: ${fmt(borehole.totalDepth)} m</div>
            <div class="popup-row">Input CRS: ${model.project.inputCrs}</div>
          `);

          marker.on('click', () => onSelectBorehole(borehole.id));
          markersRef.current[borehole.id] = marker;
        });

        map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
      } catch {
        setFailed(true);
      }
    }

    loadMap();

    return () => {
      cancelled = true;
    };
  }, [active, failed, onSelectBorehole, selectedBhId]);

  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      marker.setStyle({
        radius: id === selectedBhId ? 10 : 8,
        fillColor: id === selectedBhId ? '#1d4ed8' : '#2563eb',
      });
    });

    if (active && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
        if (polylineRef.current) {
          mapInstanceRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
        }
      }, 80);
    }
  }, [active, selectedBhId]);

  const fit = () => {
    if (mapInstanceRef.current && polylineRef.current) {
      mapInstanceRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
    }
  };

  return (
    <>
      <div className="map-toolbar">
        <div className="select-row">
          <label htmlFor="crsSelect">
            <strong>Input CRS</strong>
          </label>
          <select
            id="crsSelect"
            defaultValue={model.project.inputCrs}
            onChange={(event) => {
              if (event.target.value !== model.project.inputCrs) {
                window.alert(
                  `Preview data are validated for ${model.project.inputCrs}. Production should re-run CRS validation and transformation before rendering another CRS.`,
                );
                event.target.value = model.project.inputCrs;
              }
            }}
          >
            <option value="EPSG:27700">EPSG:27700 OSGB36 / British National Grid</option>
            <option value="EPSG:32630">EPSG:32630 WGS84 / UTM zone 30N</option>
            <option value="EPSG:3857">EPSG:3857 Web Mercator</option>
            <option value="custom">Custom / project-defined CRS</option>
          </select>
          <button className="tool-btn" type="button" onClick={fit}>
            Fit boreholes
          </button>
        </div>
        <span className="pill good">Map uses EPSG:4326 lat/lon</span>
      </div>

      {!failed && <div id="map" ref={mapRef} />}
      {failed && (
        <div className="map-fallback" style={{ display: 'block' }}>
          <div className="fallback-line" />
          <div className="fallback-point" style={{ left: '13%', top: '56%' }}>1</div>
          <div className="fallback-point" style={{ left: '36%', top: '43%' }}>2</div>
          <div className="fallback-point" style={{ left: '61%', top: '31%' }}>3</div>
          <div className="fallback-point" style={{ left: '84%', top: '19%' }}>4</div>
        </div>
      )}

      <div className="notice">
        <strong>CRS rule:</strong> no map or section is rendered in production until the source CRS, units,
        project country, and vertical datum have passed validation.
      </div>
    </>
  );
}

function CrossSection({
  selectedBhId,
  onSelectBorehole,
}: {
  selectedBhId: string;
  onSelectBorehole: (id: string) => void;
}) {
  const boreholes = model.boreholes;
  const maxChain = Math.max(...boreholes.map((borehole) => borehole.chainage));
  const maxElev = Math.ceil(Math.max(...boreholes.map((borehole) => borehole.groundLevel)) + 1);
  const minElev = Math.floor(Math.min(...boreholes.map((borehole) => borehole.groundLevel - borehole.totalDepth)) - 0.5);
  const chart = { x0: 86, y0: 86, w: 1100, h: 450 };
  const x = (chainage: number) => chart.x0 + (chainage / maxChain) * chart.w;
  const y = (elevation: number) => chart.y0 + ((maxElev - elevation) / (maxElev - minElev)) * chart.h;
  const elevationAt = (borehole: Borehole, depth: number) => borehole.groundLevel - depth;
  const layerCount = Math.max(...boreholes.map((borehole) => borehole.strata.length));

  const gridElevations: number[] = [];
  for (let elevation = maxElev; elevation >= minElev; elevation -= 2) {
    gridElevations.push(elevation);
  }

  const groundPath = boreholes
    .map((borehole, index) => `${index ? 'L' : 'M'}${x(borehole.chainage)} ${y(borehole.groundLevel)}`)
    .join(' ');

  const groundwaterPoints = boreholes
    .map((borehole) => {
      const water = borehole.groundwater[0];
      if (!water) return null;
      return `${x(borehole.chainage)},${y(elevationAt(borehole, water.depth))}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <svg width="1240" height="650" viewBox="0 0 1240 650" role="img" aria-label="Professional stratigraphic cross-section">
      <defs>
        <pattern id="madePattern" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#8b5a2b" opacity=".78" />
          <path d="M0 12 L14 0" stroke="#6b3f1d" strokeWidth="2" opacity=".45" />
        </pattern>
        <pattern id="clayPattern" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#c98b67" opacity=".72" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#8a4d33" strokeWidth="2" opacity=".45" />
        </pattern>
        <pattern id="sandPattern" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#f5d77b" opacity=".80" />
          <circle cx="3" cy="3" r="1.2" fill="#9a7216" opacity=".55" />
          <circle cx="9" cy="8" r="1.2" fill="#9a7216" opacity=".55" />
        </pattern>
        <pattern id="gravelPattern" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#a3a3a3" opacity=".72" />
          <circle cx="5" cy="6" r="2.1" fill="#525252" opacity=".55" />
          <circle cx="11" cy="11" r="2.5" fill="#525252" opacity=".55" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="1240" height="650" rx="16" fill="#ffffff" />
      <text x="28" y="34" fontSize="19" fontWeight="850" fill="#111827">
        A-A′ Stratigraphic Section Along Borehole Alignment
      </text>
      <text x="28" y="56" fontSize="12" fill="#64748b">
        Direct log columns are drawn at borehole positions. Dashed layer contacts are interpolated between extracted borehole boundaries.
      </text>

      <rect x={chart.x0} y={chart.y0} width={chart.w} height={chart.h} fill="#f8fafc" stroke="#cbd5e1" />

      {gridElevations.map((elevation) => (
        <g key={elevation}>
          <line x1={chart.x0} y1={y(elevation)} x2={chart.x0 + chart.w} y2={y(elevation)} stroke="#e2e8f0" />
          <text x={chart.x0 - 52} y={y(elevation) + 4} fontSize="10" fill="#475569">
            {elevation} m
          </text>
        </g>
      ))}

      <text
        x="24"
        y={chart.y0 + chart.h / 2}
        fontSize="12"
        fill="#64748b"
        transform={`rotate(-90 24 ${chart.y0 + chart.h / 2})`}
      >
        Elevation ({model.project.verticalDatum})
      </text>

      {Array.from({ length: layerCount }, (_, layerIndex) => {
        const firstClass = boreholes.find((borehole) => borehole.strata[layerIndex])?.strata[layerIndex].className ?? 'clay';
        const topPoints = boreholes
          .map((borehole) => `${x(borehole.chainage)},${y(elevationAt(borehole, borehole.strata[layerIndex].top))}`)
          .join(' ');
        const bottomPoints = [...boreholes]
          .reverse()
          .map((borehole) => `${x(borehole.chainage)},${y(elevationAt(borehole, borehole.strata[layerIndex].base))}`)
          .join(' ');

        return (
          <polygon
            key={layerIndex}
            points={`${topPoints} ${bottomPoints}`}
            fill={`url(#${sectionPattern[firstClass]})`}
            stroke={classColors[firstClass]}
            strokeWidth="1.4"
            strokeDasharray={layerIndex === 0 ? undefined : '6 5'}
            opacity=".88"
          />
        );
      })}

      <path d={groundPath} fill="none" stroke="#166534" strokeWidth="4" />
      <polyline points={groundwaterPoints} fill="none" stroke="#0284c7" strokeWidth="3" strokeDasharray="9 6" />
      <text x={chart.x0 + chart.w - 235} y={y(elevationAt(boreholes[boreholes.length - 1], boreholes[boreholes.length - 1].groundwater[0].depth)) - 12} fontSize="12" fill="#0369a1" fontWeight="850">
        interpreted groundwater strikes
      </text>

      {boreholes.map((borehole) => {
        const cx = x(borehole.chainage);
        const colW = 30;
        const glY = y(borehole.groundLevel);
        const tdY = y(borehole.groundLevel - borehole.totalDepth);

        return (
          <g
            key={borehole.id}
            className={`bh-log ${borehole.id === selectedBhId ? 'active' : ''}`}
            data-bh={borehole.id}
            onClick={() => onSelectBorehole(borehole.id)}
          >
            <line x1={cx} y1={glY} x2={cx} y2={tdY} stroke="#111827" strokeWidth="1" opacity=".35" />

            {borehole.strata.map((stratum) => {
              const yy = y(elevationAt(borehole, stratum.top));
              const segmentHeight = y(elevationAt(borehole, stratum.base)) - yy;

              return (
                <rect
                  key={stratum.evidence}
                  x={cx - colW / 2}
                  y={yy}
                  width={colW}
                  height={Math.max(2, segmentHeight)}
                  fill={`url(#${sectionPattern[stratum.className]})`}
                  stroke={stratum.status === 'accepted' ? '#172033' : '#b7791f'}
                  strokeWidth="1"
                  strokeDasharray={stratum.status === 'accepted' ? undefined : '5 4'}
                />
              );
            })}

            {borehole.spt.map((spt) => (
              <g key={spt.evidence}>
                <circle cx={cx + 24} cy={y(elevationAt(borehole, spt.depth))} r="4.2" fill="#dbeafe" stroke="#1d4ed8" />
                <text x={cx + 32} y={y(elevationAt(borehole, spt.depth)) + 3} fontSize="9" fill="#1e293b">
                  N{spt.n}
                </text>
              </g>
            ))}

            {borehole.groundwater.map((water) => (
              <path
                key={water.evidence}
                d={`M${cx - 40} ${y(elevationAt(borehole, water.depth)) - 5} l15 0 l-7.5 12 z`}
                fill="#bae6fd"
                stroke="#0369a1"
                strokeWidth="1.5"
              />
            ))}

            <circle cx={cx} cy={glY} r="7.5" fill="#2563eb" stroke="#fff" strokeWidth="3" />
            <text x={cx - 22} y={glY - 14} fontSize="12" fontWeight="850" fill="#111827">
              {borehole.id}
            </text>
            <text x={cx - 24} y={tdY + 18} fontSize="10" fill="#64748b">
              TD {fmt(borehole.totalDepth, 1)} m
            </text>
          </g>
        );
      })}

      <line x1={chart.x0} y1={chart.y0 + chart.h + 32} x2={chart.x0 + chart.w} y2={chart.y0 + chart.h + 32} stroke="#334155" strokeWidth="2" />
      {boreholes.map((borehole) => (
        <g key={borehole.id}>
          <line x1={x(borehole.chainage)} y1={chart.y0 + chart.h + 26} x2={x(borehole.chainage)} y2={chart.y0 + chart.h + 38} stroke="#334155" />
          <text x={x(borehole.chainage) - 12} y={chart.y0 + chart.h + 55} fontSize="11" fill="#475569">
            {borehole.chainage}
          </text>
        </g>
      ))}
      <text x={chart.x0 + chart.w / 2 - 70} y={chart.y0 + chart.h + 82} fontSize="13" fill="#64748b">
        Chainage along A-A′ section (m)
      </text>
      <text x={chart.x0} y={chart.y0 + chart.h + 108} fontSize="11" fill="#64748b">
        Vertical exaggeration used for review. Use engineering judgement before adopting interpolated strata surfaces.
      </text>
    </svg>
  );
}

function SelectedPanel({ borehole }: { borehole: Borehole }) {
  const water = borehole.groundwater[0];

  return (
    <>
      <div className="selected-panel">
        <strong>{borehole.id}</strong>
        <div className="selected-grid">
          <div><b>Source page</b><br />{borehole.sourcePage}</div>
          <div><b>Confidence</b><br />{pct(borehole.confidence)}%</div>
          <div><b>Easting</b><br />{fmt(borehole.easting)}</div>
          <div><b>Northing</b><br />{fmt(borehole.northing)}</div>
          <div><b>Lat</b><br />{borehole.lat.toFixed(6)}</div>
          <div><b>Lon</b><br />{borehole.lon.toFixed(6)}</div>
          <div><b>GL</b><br />{fmt(borehole.groundLevel)} {model.project.verticalDatum}</div>
          <div><b>Total depth</b><br />{fmt(borehole.totalDepth)} m</div>
          <div><b>Groundwater</b><br />{water ? `${fmt(water.depth)} m` : 'not detected'}</div>
          <div><b>Chainage</b><br />{borehole.chainage} m</div>
        </div>
      </div>

      <div className="crs-card">
        <div className="crs-box">
          <div className="k">Project</div>
          <div className="v">{model.project.name}</div>
          <div className="s">Country: {model.project.country}<br />Site: {model.project.site}</div>
        </div>
        <div className="crs-box">
          <div className="k">Input coordinates</div>
          <div className="v">{model.project.inputCrs}</div>
          <div className="s">{model.project.inputCrsName}<br />Easting / Northing in metres</div>
        </div>
        <div className="crs-box">
          <div className="k">Display coordinates</div>
          <div className="v">{model.project.displayCrs}</div>
          <div className="s">{model.project.displayCrsName}<br />Used by Leaflet marker positions</div>
        </div>
        <div className="crs-box">
          <div className="k">Transform engine</div>
          <div className="v">{model.project.crsTransformEngine}</div>
          <div className="s">Authoritative conversion should run server-side.</div>
        </div>
      </div>
    </>
  );
}

function CoordinateTable({ onSelectBorehole }: { onSelectBorehole: (id: string) => void }) {
  return (
    <table>
      <thead>
        <tr><th>BH</th><th>Easting</th><th>Northing</th><th>Latitude</th><th>Longitude</th><th>Status</th></tr>
      </thead>
      <tbody>
        {model.boreholes.map((borehole) => (
          <tr key={borehole.id}>
            <td><button className="tool-btn" type="button" onClick={() => onSelectBorehole(borehole.id)}>{borehole.id}</button></td>
            <td>{fmt(borehole.easting)}</td>
            <td>{fmt(borehole.northing)}</td>
            <td>{borehole.lat.toFixed(7)}</td>
            <td>{borehole.lon.toFixed(7)}</td>
            <td><span className="pill good">converted</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IntegratedJson({ selectedBhId }: { selectedBhId: string }) {
  const json = useMemo(() => {
    const integrated = {
      schema_version: model.schemaVersion,
      run: model.run,
      project: model.project,
      selected_borehole: selectedBhId,
      boreholes: model.boreholes.map((borehole) => ({
        id: borehole.id,
        source_page: borehole.sourcePage,
        source_coordinates: {
          easting: borehole.easting,
          northing: borehole.northing,
          crs: model.project.inputCrs,
          unit: 'm',
          evidence_id: borehole.evidence.coords,
        },
        display_coordinates: {
          latitude: borehole.lat,
          longitude: borehole.lon,
          crs: model.project.displayCrs,
        },
        ground_level_m: borehole.groundLevel,
        total_depth_m: borehole.totalDepth,
        chainage_m: borehole.chainage,
        evidence: borehole.evidence,
        strata: borehole.strata,
        spt: borehole.spt,
        groundwater: borehole.groundwater,
      })),
      validation: {
        status: model.run.status,
        warnings: model.quality.warnings,
      },
    };

    return JSON.stringify(integrated, null, 2);
  }, [selectedBhId]);

  return <pre>{json}</pre>;
}

export default function IntegratedGeotechReviewPage() {
  const [activeView, setActiveView] = useState<ViewId>('review');
  const [selectedBhId, setSelectedBhId] = useState('BH-03');
  const [selectedEvidenceId, setSelectedEvidenceId] = useState('ev_BH03_layer_3');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [validationTab, setValidationTab] = useState<'warnings' | 'pipeline' | 'artifacts'>('warnings');

  const borehole = getBorehole(selectedBhId);

  const selectBorehole = (id: string) => {
    const next = getBorehole(id);
    setSelectedBhId(id);
    setSelectedEvidenceId(next.strata[Math.min(3, next.strata.length - 1)].evidence);
  };

  return (
    <>
      <AppStyles />

      <header>
        <div className="header-top">
          <div>
            <h1>geotechCLI Integrated Vision + Geospatial Review</h1>
            <div className="subtitle">
              One data-driven review package: extracted report evidence, borehole strip logs, validated coordinates,
              real-map markers, CRS guardrails, and a professional A-A′ stratigraphic section generated from the same borehole JSON.
            </div>
            <div className="badge-row">
              <span className="badge">OCR: {model.run.models.ocr}</span>
              <span className="badge">Vision: {model.run.models.vision}</span>
              <span className="badge">Text / Agent: {model.run.models.text}</span>
              <span className="badge">BYOK profile: {model.run.providerProfile}</span>
              <span className="badge">CRS checked before map render</span>
            </div>
          </div>

          <div className="run-card">
            <div><span>Run ID</span><strong>{model.run.id}</strong></div>
            <div><span>Document</span><strong>{model.run.document}</strong></div>
            <div><span>Provider</span><strong>{model.run.providerProfile}</strong></div>
            <div><span>Schema</span><strong>{model.schemaVersion}</strong></div>
            <div><span>Status</span><strong>{model.run.status.replace('_', ' ')}</strong></div>
          </div>
        </div>
      </header>

      <main>
        <SummaryCards />

        <nav className="view-nav" aria-label="Review views">
          <button className={`nav-btn ${activeView === 'review' ? 'active' : ''}`} type="button" onClick={() => setActiveView('review')}>Extraction review</button>
          <button className={`nav-btn ${activeView === 'geo' ? 'active' : ''}`} type="button" onClick={() => setActiveView('geo')}>Map + A-A′ section</button>
          <button className={`nav-btn ${activeView === 'validation' ? 'active' : ''}`} type="button" onClick={() => setActiveView('validation')}>Validation + JSON</button>
        </nav>

        {activeView === 'review' && (
          <section className="view active">
            <div className="review-grid">
              <div className="panel">
                <h2>Source report evidence <small>generated from selected borehole evidence IDs</small></h2>
                <div className="panel-body">
                  <div className="toolbar">
                    {(['all', 'header', 'strata', 'spt', 'water'] as EvidenceFilter[]).map((filter) => (
                      <button
                        key={filter}
                        className={`tool-btn filter ${evidenceFilter === filter ? 'active' : ''}`}
                        type="button"
                        onClick={() => setEvidenceFilter(filter)}
                      >
                        {filter === 'all' ? 'All evidence' : filter === 'spt' ? 'SPT' : filter[0].toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                  <SourceReportPage
                    borehole={borehole}
                    selectedEvidenceId={selectedEvidenceId}
                    evidenceFilter={evidenceFilter}
                    onEvidenceSelect={setSelectedEvidenceId}
                  />
                  <div className="legend">
                    <span className="legend-item"><span className="swatch" />Accepted evidence</span>
                    <span className="legend-item"><span className="swatch warn" />Review recommended</span>
                    <span className="legend-item"><span className="swatch good" />Validated geometry</span>
                    <span className="legend-item"><span className="swatch bad" />Blocking error, if present</span>
                  </div>
                </div>
              </div>

              <div className="panel">
                <h2>Validated strip log <small>deterministic renderer</small></h2>
                <div className="panel-body">
                  <div className="svg-wrap">
                    <StripLog
                      borehole={borehole}
                      selectedEvidenceId={selectedEvidenceId}
                      onEvidenceSelect={setSelectedEvidenceId}
                    />
                  </div>
                </div>
              </div>

              <div className="panel">
                <h2>Extracted fields <small>schema + confidence + evidence</small></h2>
                <div className="panel-body">
                  <FieldsPanel
                    borehole={borehole}
                    selectedEvidenceId={selectedEvidenceId}
                    onEvidenceSelect={setSelectedEvidenceId}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === 'geo' && (
          <section className="view active">
            <div className="geo-grid">
              <div className="panel">
                <h2>Real-map borehole view <small>source CRS transformed before visualization</small></h2>
                <div className="panel-body">
                  <LeafletMap
                    selectedBhId={selectedBhId}
                    active={activeView === 'geo'}
                    onSelectBorehole={selectBorehole}
                  />
                </div>
              </div>

              <div className="panel">
                <h2>Selected borehole + CRS guardrail <small>same object drives log, map, and section</small></h2>
                <div className="panel-body">
                  <SelectedPanel borehole={borehole} />
                  <table style={{ marginTop: 12 }}>
                    <thead><tr><th>Guardrail</th><th>Status</th><th>Reason</th></tr></thead>
                    <tbody>
                      <tr><td>CRS present in metadata</td><td><span className="pill good">pass</span></td><td>Source CRS explicitly set from project/report metadata.</td></tr>
                      <tr><td>Country / CRS compatibility</td><td><span className="pill good">pass</span></td><td>United Kingdom project and British National Grid are compatible.</td></tr>
                      <tr><td>Coordinate magnitude sanity</td><td><span className="pill good">pass</span></td><td>Eastings around 526k and northings around 183k are plausible.</td></tr>
                      <tr><td>Datum transformation</td><td><span className="pill warn">verify</span></td><td>Confirm grid shift and vertical datum for survey-grade deliverables.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel section-panel">
              <h2>Professional A-A′ stratigraphic section <small>interpolated contacts + actual vertical borehole log columns</small></h2>
              <div className="panel-body">
                <div className="cross-section-wrap">
                  <CrossSection selectedBhId={selectedBhId} onSelectBorehole={selectBorehole} />
                </div>
                <div className="legend">
                  <span className="legend-item"><span className="swatch made" />Made Ground</span>
                  <span className="legend-item"><span className="swatch clay" />Firm silty CLAY</span>
                  <span className="legend-item"><span className="swatch sand" />Medium dense SAND</span>
                  <span className="legend-item"><span className="swatch gravel" />Dense sandy GRAVEL</span>
                  <span className="legend-item"><span style={{ width: 30, borderTop: '3px dashed #0284c7', display: 'inline-block' }} />Groundwater strikes</span>
                  <span className="legend-item"><span style={{ width: 30, borderTop: '2px dashed #64748b', display: 'inline-block' }} />Interpolated contacts</span>
                </div>
                <div className="notice">
                  <strong>Engineering note:</strong> strata between boreholes are conceptual interpolations for review.
                  Directly extracted log columns are shown at borehole locations; interpolated surfaces must not be treated
                  as design surfaces without engineering review.
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === 'validation' && (
          <section className="view active">
            <div className="data-grid">
              <div className="panel">
                <h2>Validation workflow <small>extraction, geospatial, and rendering checks</small></h2>
                <div className="tabs">
                  <button className={`tab ${validationTab === 'warnings' ? 'active' : ''}`} type="button" onClick={() => setValidationTab('warnings')}>Warnings</button>
                  <button className={`tab ${validationTab === 'pipeline' ? 'active' : ''}`} type="button" onClick={() => setValidationTab('pipeline')}>Pipeline</button>
                  <button className={`tab ${validationTab === 'artifacts' ? 'active' : ''}`} type="button" onClick={() => setValidationTab('artifacts')}>Artifacts</button>
                </div>
                <div className="panel-body">
                  {validationTab === 'warnings' && (
                    <>
                      <div className="warning-list">
                        <div className="warning"><strong>LOW_CONFIDENCE_STRATA_BOUNDARY</strong><br />Some gravel boundaries are accepted for visualization but marked review-recommended in export.</div>
                        <div className="warning"><strong>GROUNDWATER_SYMBOL_REVIEW</strong><br />Graphical water strike symbols are detected; standing-water dates are not present in the source evidence.</div>
                        <div className="warning"><strong>DATUM_TRANSFORM_VERIFY</strong><br />mAOD vertical datum is extracted, but survey-grade deliverables should confirm project datum and grid-shift availability.</div>
                      </div>
                      <table style={{ marginTop: 13 }}>
                        <thead><tr><th>Validator</th><th>Status</th><th>Result</th></tr></thead>
                        <tbody>
                          <tr><td>Evidence coverage</td><td><span className="pill good">pass</span></td><td>All non-null extracted values have evidence IDs.</td></tr>
                          <tr><td>Depth-axis calibration</td><td><span className="pill good">pass</span></td><td>R² 0.998 from detected depth labels.</td></tr>
                          <tr><td>Strata monotonicity</td><td><span className="pill good">pass</span></td><td>No overlaps or unexplained gaps in selected logs.</td></tr>
                          <tr><td>CRS validation</td><td><span className="pill good">pass</span></td><td>EPSG:27700 converted to EPSG:4326 for map rendering.</td></tr>
                          <tr><td>Cross-section interpolation</td><td><span className="pill warn">review</span></td><td>Interpolated boundaries are conceptual.</td></tr>
                        </tbody>
                      </table>
                    </>
                  )}

                  {validationTab === 'pipeline' && (
                    <div className="pipeline">
                      <div className="step"><div className="num">1</div><div><strong>GLM-OCR layout parsing</strong><small>Markdown, layout blocks, bboxes, page dimensions, crop artifacts</small></div><span className="pill good">done</span></div>
                      <div className="step"><div className="num">2</div><div><strong>GLM-5.1 page classification</strong><small>Borehole pages routed to the borehole extractor</small></div><span className="pill good">done</span></div>
                      <div className="step"><div className="num">3</div><div><strong>Deterministic depth mapping</strong><small>y-coordinate to depth model; no LLM guessing for depths</small></div><span className="pill good">done</span></div>
                      <div className="step"><div className="num">4</div><div><strong>GLM-5V crop verification</strong><small>Used only for uncertain symbols, columns, and OCR alternatives</small></div><span className="pill warn">targeted</span></div>
                      <div className="step"><div className="num">5</div><div><strong>Schema normalization</strong><small>Evidence packets become borehole JSON with coordinates and source references</small></div><span className="pill good">done</span></div>
                      <div className="step"><div className="num">6</div><div><strong>CRS transform + geospatial render</strong><small>Source easting/northing transformed before mapping and section generation</small></div><span className="pill good">done</span></div>
                    </div>
                  )}

                  {validationTab === 'artifacts' && (
                    <table>
                      <thead><tr><th>Artifact</th><th>Purpose</th><th>Status</th></tr></thead>
                      <tbody>
                        <tr><td><code>evidence/evidence.jsonl</code></td><td>OCR/layout evidence packets with bboxes and crop links</td><td><span className="pill good">ready</span></td></tr>
                        <tr><td><code>extraction/boreholes.json</code></td><td>Strict structured borehole data used by every UI view</td><td><span className="pill good">ready</span></td></tr>
                        <tr><td><code>geospatial/crs_validation.json</code></td><td>CRS checks, candidate systems, transform status</td><td><span className="pill warn">verify</span></td></tr>
                        <tr><td><code>geospatial/boreholes.geojson</code></td><td>EPSG:4326 map-ready borehole points</td><td><span className="pill good">ready</span></td></tr>
                        <tr><td><code>review/integrated_review.html</code></td><td>Unified evidence, log, map, and section review package</td><td><span className="pill good">ready</span></td></tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="panel">
                <h2>Integrated extraction JSON <small>single source of truth for this UI</small></h2>
                <div className="panel-body">
                  <IntegratedJson selectedBhId={selectedBhId} />
                </div>
              </div>
            </div>

            <div className="footer-grid">
              <div className="panel">
                <h2>Borehole coordinate table <small>source CRS + transformed map CRS</small></h2>
                <div className="panel-body">
                  <CoordinateTable onSelectBorehole={selectBorehole} />
                </div>
              </div>

              <div className="panel">
                <h2>Provider-agnostic contract <small>same UI, any BYOK provider</small></h2>
                <div className="panel-body">
                  <table>
                    <thead><tr><th>Capability</th><th>Current provider</th><th>Required contract</th></tr></thead>
                    <tbody>
                      <tr><td>OCR layout</td><td>GLM-OCR</td><td>Returns text, tables, bboxes, page dimensions, crop refs</td></tr>
                      <tr><td>Vision verification</td><td>GLM-5V-Turbo</td><td>Answers bounded crop questions as JSON</td></tr>
                      <tr><td>Text extraction / agent</td><td>GLM-5.1</td><td>Normalizes evidence into strict schema, no invention</td></tr>
                      <tr><td>CRS transform</td><td>geotechCLI local</td><td>Validates source CRS and transforms to EPSG:4326</td></tr>
                      <tr><td>Visualization</td><td>geotechCLI local</td><td>Rendered only from validated structured JSON</td></tr>
                    </tbody>
                  </table>
                  <p className="small-muted">
                    The interface is not a static dashboard: every visible value is tied to an extracted borehole object,
                    evidence ID, CRS state, and validation status.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
