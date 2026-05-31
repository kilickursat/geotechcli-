import type { FemResultManifest } from './types.js';
import { validateFemResultManifest } from './validation.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('</', '<\\/');
}

export function renderFemWebglHtml(manifest: FemResultManifest): string {
  const renderValidation = validateFemResultManifest(manifest);
  if (renderValidation.status === 'blocked') {
    throw new Error(`FEM result manifest failed validation: ${renderValidation.findings.map((item) => `${item.code}: ${item.message}`).join('; ')}`);
  }
  const data = safeJson(manifest);
  const renderValidationData = safeJson(renderValidation);
  const title = escapeHtml(manifest.title);
  const status = renderValidation.status.toUpperCase();
  const validationClass = renderValidation.status === 'ready' ? '' : 'warn';
  const findingRows = renderValidation.findings.length > 0
    ? renderValidation.findings.map((finding) => `
        <li><strong>${escapeHtml(finding.severity)}</strong> ${escapeHtml(finding.message)}</li>`).join('')
    : '<li>No blocking validation issues. Review assumptions before design use.</li>';
  const assumptionRows = manifest.assumptions.map((assumption) => `
        <li><strong>${escapeHtml(assumption.parameter)}</strong>: ${escapeHtml(String(assumption.value))}${assumption.unit ? ` ${escapeHtml(assumption.unit)}` : ''}<br><span>${escapeHtml(assumption.basis)}</span></li>`).join('');
  const limitationRows = manifest.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const frameControlMarkup = manifest.visualization.frames?.length ? `
      <div id="fieldControls" style="display:none">
        <label for="fieldSelect">Result field</label>
        <select id="fieldSelect" style="width:100%;border:1px solid rgba(148,163,184,.28);background:#0f1b2d;color:#eff6ff;border-radius:9px;padding:7px 9px;font-size:12px"></select>
      </div>
      <div id="stageControls" style="display:none">
        <label for="stageSlider">Stage: <b id="stageLabel">Final</b></label>
        <input id="stageSlider" type="range" min="0" max="0" value="0" step="1">
      </div>` : '';
  const primaryResultField = manifest.resultFields?.[0];
  const legendTitle = escapeHtml(`${primaryResultField?.label ?? 'Vertical settlement'} color`);
  const legendUnit = primaryResultField?.unit ? ` ${primaryResultField.unit}` : '';
  const legendMin = escapeHtml(`low${legendUnit}`);
  const legendMax = escapeHtml(`high${legendUnit}`);
  const legendNote = escapeHtml(primaryResultField?.signConvention
    ?? 'Warm colors show greater downward settlement. Displayed deformation is exaggerated by the slider.');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - geotechCLI FEM</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#0f1b2d;--panel2:#142238;--text:#e8eef8;--muted:#a8b3c7;--line:#29405f;--accent:#38bdf8;--warn:#f59e0b;--good:#22c55e}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
#app{position:fixed;inset:0;display:grid;grid-template-columns:minmax(0,1fr) clamp(300px,27vw,380px)}
main{position:relative;min-width:0;background:radial-gradient(circle at 50% 34%,rgba(56,189,248,.14),transparent 36%),linear-gradient(180deg,#020617,#07111f 55%,#0b1220)}
canvas{width:100%;height:100%;display:block;cursor:grab}canvas:active{cursor:grabbing}
.viewport-label{position:absolute;top:18px;left:20px;max-width:min(520px,calc(100% - 40px));z-index:3;pointer-events:none;border:1px solid rgba(15,23,42,.36);background:linear-gradient(90deg,rgba(2,6,23,.76),rgba(2,6,23,.42));border-radius:12px;padding:10px 12px;box-shadow:0 14px 34px rgba(0,0,0,.28);backdrop-filter:blur(8px)}
.viewport-label strong{display:block;color:#e0f2fe;font-size:14px;line-height:1.25;margin-bottom:3px}.viewport-label span{display:block;color:#cbd5e1;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
aside{border-left:1px solid var(--line);background:linear-gradient(180deg,rgba(15,27,45,.96),rgba(7,17,31,.98));padding:20px;overflow:auto;box-shadow:-18px 0 44px rgba(0,0,0,.34)}
h1{font-size:20px;line-height:1.2;margin:0 0 8px}.sub{font-size:13px;line-height:1.45;color:var(--muted);margin:0 0 14px}
.badge{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(56,189,248,.28);background:rgba(56,189,248,.11);color:#dff7ff;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;margin-bottom:12px}
.dot{width:8px;height:8px;border-radius:99px;background:var(--good);box-shadow:0 0 16px var(--good)}
.card{border:1px solid var(--line);background:rgba(20,34,56,.82);border-radius:14px;padding:14px;margin:12px 0}
.card h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#bae6fd;margin:0 0 10px}
.kv{display:grid;grid-template-columns:1fr auto;gap:8px 12px;font-size:12.5px}.kv span:nth-child(odd){color:var(--muted)}.kv span:nth-child(even){font-variant-numeric:tabular-nums;text-align:right}
label{display:block;color:var(--muted);font-size:12.5px;margin:10px 0 6px}input[type=range]{width:100%;accent-color:var(--accent)}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button{border:1px solid rgba(148,163,184,.28);background:#1e3a5f;color:#eff6ff;border-radius:9px;padding:7px 10px;font-size:12px;cursor:pointer}button:hover{background:#25638e}
ul{margin:0;padding-left:18px;color:#dbeafe;font-size:12.5px;line-height:1.45}li{margin:8px 0}li span{color:var(--muted)}
.legend{display:grid;grid-template-columns:52px 1fr 56px;gap:8px;align-items:center;color:var(--muted);font-size:11.5px}.bar{height:12px;border-radius:99px;background:linear-gradient(90deg,rgb(43,62,154),rgb(47,107,205),rgb(56,170,210),rgb(80,200,120),rgb(235,210,75),rgb(220,83,44),rgb(170,25,55));border:1px solid rgba(255,255,255,.22)}
#fallback{display:none;position:absolute;left:20px;bottom:20px;max-width:380px;border:1px solid rgba(245,158,11,.45);background:rgba(7,17,31,.92);border-radius:14px;padding:12px 14px;color:#fde68a;z-index:2;box-shadow:0 14px 40px rgba(0,0,0,.28);font-size:12px;line-height:1.4}
.warn{color:#fbbf24}.small{font-size:11.5px;line-height:1.45;color:#94a3b8}
@media(max-width:900px){#app{grid-template-columns:1fr;grid-template-rows:1fr 42vh}aside{border-left:0;border-top:1px solid var(--line)}.viewport-label{top:14px;left:14px;max-width:calc(100% - 28px);padding:8px 10px}.viewport-label strong{font-size:13px}.viewport-label span{font-size:11px}}
</style>
</head>
<body>
<div id="app">
  <main>
    <canvas id="glcanvas" aria-label="Interactive WebGL FEM settlement visualization"></canvas>
    <div id="viewportLabel" class="viewport-label" aria-live="polite"><strong>FEM result field</strong><span>Initializing renderer...</span></div>
    <div id="fallback">WebGL could not be started in this browser. Try recent Chrome, Edge, Firefox, or Safari with hardware acceleration enabled.</div>
  </main>
  <aside>
    <div class="badge"><span class="dot"></span><span>Experimental deterministic FEM preview</span></div>
    <h1>${title}</h1>
    <p class="sub">Self-contained geotechCLI WebGL artifact. The model is deterministic and replayable from the embedded result manifest. It is an experimental screening demo, not a design model.</p>
    <div class="card"><h2>Controls</h2>
      <label for="scale">Deformation scale: <b id="scaleLabel">120x</b></label>
      <input id="scale" type="range" min="0" max="300" value="120" step="1">
      <div class="row" style="margin-top:10px"><button data-scale="0">0x</button><button data-scale="60">60x</button><button data-scale="120">120x</button><button data-scale="240">240x</button><button id="reset">Reset view</button></div>
      ${frameControlMarkup}
      <label class="row"><input id="wire" type="checkbox" checked> <span>Show mesh wireframe</span></label>
      <label class="row"><input id="patch" type="checkbox" checked> <span>Show structure outline</span></label>
    </div>
    <div class="card"><h2>Result envelope</h2><div class="kv" id="stats"></div></div>
    <div class="card"><h2>Validation status</h2><p class="sub"><strong class="${validationClass}">${escapeHtml(status)}</strong> - ${renderValidation.blockers} blockers, ${renderValidation.reviewItems} review items</p><ul>${findingRows}</ul></div>
    <div class="card"><h2 id="legendTitle">${legendTitle}</h2><div class="legend"><span id="legendMin">${legendMin}</span><div class="bar"></div><span id="legendMax">${legendMax}</span></div><p class="small" id="legendNote">${legendNote}</p></div>
    <div class="card"><h2>Assumptions</h2><ul>${assumptionRows}</ul></div>
    <div class="card"><h2>Limitations</h2><ul>${limitationRows}</ul></div>
  </aside>
</div>
<script>
const MANIFEST = ${data};
const RENDER_VALIDATION = ${renderValidationData};
window.__GEOTECH_FEM_RENDER_VALIDATION__ = RENDER_VALIDATION;
const DATA = MANIFEST.visualization;
const FIELD_META = new Map((Array.isArray(MANIFEST.resultFields)?MANIFEST.resultFields:[]).map(f=>[f.id,f]));
const STEP_META = new Map((Array.isArray(MANIFEST.steps)?MANIFEST.steps:[]).map(s=>[s.index,s]));
const PRIMARY_FIELD = Array.isArray(MANIFEST.resultFields)&&MANIFEST.resultFields.length?MANIFEST.resultFields[0]:null;
const PRIMARY_STEP = Array.isArray(MANIFEST.steps)&&MANIFEST.steps.length?MANIFEST.steps[MANIFEST.steps.length-1]:null;
const FRAMES = Array.isArray(DATA.frames)&&DATA.frames.length?DATA.frames:[{field:PRIMARY_FIELD?.id||'primary',fieldLabel:PRIMARY_FIELD?.label||'Vertical displacement',stageIndex:PRIMARY_STEP?.index??0,stageLabel:PRIMARY_STEP?.label||'Final',disp:DATA.disp,color:DATA.color}];
const FIELD_OPTIONS = Array.from(new Map(FRAMES.map(f=>[f.field,FIELD_META.get(f.field)?.label||f.fieldLabel||f.field])).entries()).map(([field,label])=>({field,label}));
const STAGE_OPTIONS = Array.from(new Map(FRAMES.filter(f=>Number.isFinite(f.stageIndex)).map(f=>[f.stageIndex,STEP_META.get(Number(f.stageIndex))?.label||f.stageLabel||('Stage '+(Number(f.stageIndex)+1))])).entries()).sort((a,b)=>a[0]-b[0]).map(([stageIndex,label])=>({stageIndex,label}));
let activeField = FIELD_OPTIONS[0]?.field || 'primary';
let activeStage = STAGE_OPTIONS[STAGE_OPTIONS.length-1]?.stageIndex ?? 0;
let canvas = document.getElementById('glcanvas');
const fallback = document.getElementById('fallback');
document.body.dataset.renderer = 'initializing';
document.body.dataset.validationStatus = RENDER_VALIDATION.status;
document.body.dataset.validationBlockers = String(RENDER_VALIDATION.blockers);
document.body.dataset.validationReviewItems = String(RENDER_VALIDATION.reviewItems);
let gl=null, triProgram=null, lineProgram=null, baseBuf=null, dispBuf=null, colorBuf=null, triBuf=null, edgeBuf=null, obaseBuf=null, odispBuf=null, oidxBuf=null;
function ident(){return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}
function mul(a,b){const r=new Array(16).fill(0);for(let c=0;c<4;c++){for(let row=0;row<4;row++){for(let k=0;k<4;k++){r[c*4+row]+=a[k*4+row]*b[c*4+k];}}}return r}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function translate(m,x,y,z){const t=ident();t[12]=x;t[13]=y;t[14]=z;return mul(m,t)}
function rotateX(m,a){const c=Math.cos(a),s=Math.sin(a);return mul(m,[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])}
function rotateZ(m,a){const c=Math.cos(a),s=Math.sin(a);return mul(m,[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1])}
function scaleM(m,s){return mul(m,[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1])}
let rx=-0.92, rz=-0.72, zoom=0.052, deform=120, dragging=false, lx=0, ly=0;
function activeFrame(){return FRAMES.find(f=>f.field===activeField&&((f.stageIndex??0)===activeStage))||FRAMES.find(f=>f.field===activeField)||FRAMES[0];}
function activeFieldMeta(){return FIELD_META.get(activeField)||{label:activeFrame()?.fieldLabel||'Result field',unit:'',signConvention:'Displayed deformation is exaggerated by the slider.'};}
function updateLegend(){const meta=activeFieldMeta();const title=document.getElementById('legendTitle'),min=document.getElementById('legendMin'),max=document.getElementById('legendMax'),note=document.getElementById('legendNote');if(title)title.textContent=(meta.label||'Result field')+' color';if(min)min.textContent=meta.unit?'low '+meta.unit:'low';if(max)max.textContent=meta.unit?'high '+meta.unit:'high';if(note)note.textContent=meta.signConvention||'Warm colors show greater result magnitude. Displayed deformation is exaggerated by the slider.';}
function resizeCanvas(){const dpr=Math.min(window.devicePixelRatio||1,2);const rect=canvas.getBoundingClientRect();const w=Math.max(1,Math.floor((rect.width||canvas.clientWidth||window.innerWidth)*dpr)),h=Math.max(1,Math.floor((rect.height||canvas.clientHeight||window.innerHeight)*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
function markRenderer(name,message){document.body.dataset.renderer=name;if(message){fallback.textContent=message;fallback.style.display='block';}else{fallback.style.display='none';}}
function updateViewportLabel(){const frame=activeFrame();const label=document.getElementById('viewportLabel');if(!label)return;const renderer=(document.body.dataset.renderer||'renderer').replace(/-/g,' ');const title=label.querySelector('strong'),detail=label.querySelector('span');if(title)title.textContent=frame.fieldLabel||'3D FEM result field';if(detail)detail.textContent=(frame.stageLabel||'Final')+' - '+renderer+'; deformation scale '+deform+'x';}
function shader(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ throw new Error(gl.getShaderInfoLog(s)||'shader compile failed'); } return s; }
function program(vs, fs){ const p=gl.createProgram(); gl.attachShader(p,shader(gl.VERTEX_SHADER,vs)); gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)){ throw new Error(gl.getProgramInfoLog(p)||'program link failed'); } return p; }
function buf(data,target){ const b=gl.createBuffer(); gl.bindBuffer(target,b); gl.bufferData(target,data,gl.STATIC_DRAW); return b; }
function attr(p,name,b,size){ const l=gl.getAttribLocation(p,name); if(l<0)return; gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l,size,gl.FLOAT,false,0,0); }
function initWebgl(){try{const contextOptions={antialias:true,alpha:false,preserveDrawingBuffer:true};gl=canvas.getContext('webgl',contextOptions)||canvas.getContext('experimental-webgl',contextOptions);if(!gl)return false;triProgram=program('attribute vec3 aBase;attribute vec3 aDisp;attribute vec3 aColor;uniform mat4 uMvp;uniform float uScale;varying vec3 vColor;void main(){vec3 p=aBase+aDisp*uScale;vColor=aColor;gl_Position=uMvp*vec4(p,1.0);}','precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.0);}');lineProgram=program('attribute vec3 aBase;attribute vec3 aDisp;uniform mat4 uMvp;uniform float uScale;void main(){vec3 p=aBase+aDisp*uScale;gl_Position=uMvp*vec4(p,1.0);}','precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}');baseBuf=buf(new Float32Array(DATA.base),gl.ARRAY_BUFFER);dispBuf=buf(new Float32Array(DATA.disp),gl.ARRAY_BUFFER);colorBuf=buf(new Float32Array(DATA.color),gl.ARRAY_BUFFER);triBuf=buf(new Uint16Array(DATA.tri),gl.ELEMENT_ARRAY_BUFFER);edgeBuf=buf(new Uint16Array(DATA.edge),gl.ELEMENT_ARRAY_BUFFER);obaseBuf=buf(new Float32Array(DATA.outlineBase),gl.ARRAY_BUFFER);odispBuf=buf(new Float32Array(DATA.outlineDisp),gl.ARRAY_BUFFER);oidxBuf=buf(new Uint16Array(DATA.outlineIdx),gl.ELEMENT_ARRAY_BUFFER);return true;}catch(error){console.warn('WebGL FEM renderer unavailable; using canvas fallback.',error);return false;}}
function mvp(){let m=ident();m=translate(m,0,0,-3.2);m=rotateX(m,rx);m=rotateZ(m,rz);m=scaleM(m,zoom);return mul(perspective(Math.PI/4,canvas.width/canvas.height,0.1,100),m)}
function drawWebgl(){resizeCanvas();if(!gl||gl.drawingBufferWidth<1||gl.drawingBufferHeight<1){drawCanvasFallback('Canvas fallback: WebGL context returned a zero-size drawing buffer.');return;}const frame=activeFrame();gl.bindBuffer(gl.ARRAY_BUFFER,dispBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(frame.disp),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,colorBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(frame.color),gl.STATIC_DRAW);markRenderer('webgl','');updateViewportLabel();gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0.02,0.06,0.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);const matrix=new Float32Array(mvp());gl.useProgram(triProgram);attr(triProgram,'aBase',baseBuf,3);attr(triProgram,'aDisp',dispBuf,3);attr(triProgram,'aColor',colorBuf,3);gl.uniformMatrix4fv(gl.getUniformLocation(triProgram,'uMvp'),false,matrix);gl.uniform1f(gl.getUniformLocation(triProgram,'uScale'),deform);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triBuf);gl.drawElements(gl.TRIANGLES,DATA.tri.length,gl.UNSIGNED_SHORT,0);if(document.getElementById('wire').checked){gl.useProgram(lineProgram);attr(lineProgram,'aBase',baseBuf,3);attr(lineProgram,'aDisp',dispBuf,3);gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram,'uMvp'),false,matrix);gl.uniform1f(gl.getUniformLocation(lineProgram,'uScale'),deform);gl.uniform4f(gl.getUniformLocation(lineProgram,'uColor'),0.82,0.9,1,0.42);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,edgeBuf);gl.drawElements(gl.LINES,DATA.edge.length,gl.UNSIGNED_SHORT,0);}if(document.getElementById('patch').checked){gl.useProgram(lineProgram);attr(lineProgram,'aBase',obaseBuf,3);attr(lineProgram,'aDisp',odispBuf,3);gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram,'uMvp'),false,matrix);gl.uniform1f(gl.getUniformLocation(lineProgram,'uScale'),0);gl.uniform4f(gl.getUniformLocation(lineProgram,'uColor'),1,0.78,0.24,1);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,oidxBuf);gl.drawElements(gl.LINES,DATA.outlineIdx.length,gl.UNSIGNED_SHORT,0);}}
function colorAt(colors,i){return [colors[i*3]||0,colors[i*3+1]||0,colors[i*3+2]||0];}
function cssRgb(rgb,alpha){return 'rgba('+Math.round(rgb[0]*255)+','+Math.round(rgb[1]*255)+','+Math.round(rgb[2]*255)+','+alpha+')';}
function pointFrom(base,disp,i,scale){return [base[i*3]+(disp[i*3]||0)*scale,base[i*3+1]+(disp[i*3+1]||0)*scale,base[i*3+2]+(disp[i*3+2]||0)*scale];}
function projectPoint(p){const cz=Math.cos(rz),sz=Math.sin(rz),cx=Math.cos(rx),sx=Math.sin(rx);const x1=p[0]*cz-p[1]*sz,y1=p[0]*sz+p[1]*cz,z1=p[2];const y2=y1*cx-z1*sx;const fit=Math.min(canvas.width,canvas.height)*zoom*0.95;return [canvas.width/2+x1*fit,canvas.height*0.50-y2*fit];}
function drawEdge(ctx,base,disp,a,b,scale,color,width){const p1=projectPoint(pointFrom(base,disp,a,scale)),p2=projectPoint(pointFrom(base,disp,b,scale));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.stroke();}
function drawCanvasFallback(message){resizeCanvas();markRenderer('canvas2d-fallback',message||'Canvas fallback: WebGL unavailable in this browser.');updateViewportLabel();let ctx=canvas.getContext('2d');if(!ctx){const replacement=document.createElement('canvas');replacement.id='glcanvas';replacement.setAttribute('aria-label','Canvas FEM visualization fallback');canvas.replaceWith(replacement);canvas=replacement;bindCanvasEvents(canvas);resizeCanvas();ctx=canvas.getContext('2d');}if(!ctx){fallback.textContent='Canvas fallback could not be started in this browser.';return;}const frame=activeFrame();const w=canvas.width,h=canvas.height;const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#020617');grad.addColorStop(0.58,'#07111f');grad.addColorStop(1,'#0b1220');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);const glow=ctx.createRadialGradient(w*0.52,h*0.34,0,w*0.52,h*0.34,Math.min(w,h)*0.48);glow.addColorStop(0,'rgba(56,189,248,.16)');glow.addColorStop(1,'rgba(56,189,248,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);for(let i=0;i<DATA.tri.length;i+=3){const a=DATA.tri[i],b=DATA.tri[i+1],c=DATA.tri[i+2];const pa=projectPoint(pointFrom(DATA.base,frame.disp,a,deform)),pb=projectPoint(pointFrom(DATA.base,frame.disp,b,deform)),pc=projectPoint(pointFrom(DATA.base,frame.disp,c,deform));const ca=colorAt(frame.color,a),cb=colorAt(frame.color,b),cc=colorAt(frame.color,c);ctx.fillStyle=cssRgb([(ca[0]+cb[0]+cc[0])/3,(ca[1]+cb[1]+cc[1])/3,(ca[2]+cb[2]+cc[2])/3],0.92);ctx.beginPath();ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pb[0],pb[1]);ctx.lineTo(pc[0],pc[1]);ctx.closePath();ctx.fill();}if(document.getElementById('wire').checked){for(let i=0;i<DATA.edge.length;i+=2){drawEdge(ctx,DATA.base,frame.disp,DATA.edge[i],DATA.edge[i+1],deform,'rgba(226,232,240,.32)',1);}}if(document.getElementById('patch').checked){for(let i=0;i<DATA.outlineIdx.length;i+=2){drawEdge(ctx,DATA.outlineBase,DATA.outlineDisp,DATA.outlineIdx[i],DATA.outlineIdx[i+1],0,'rgba(251,191,36,.95)',2);}}}
const webglReady=initWebgl();
function draw(){if(webglReady){try{drawWebgl();return;}catch(error){console.warn('WebGL draw failed; using canvas fallback.',error);}}drawCanvasFallback('Canvas fallback: WebGL unavailable in this browser.');}
function updateScale(v){deform=Number(v);document.getElementById('scale').value=String(deform);document.getElementById('scaleLabel').textContent=String(deform)+'x';draw();}
function bindCanvasEvents(target){target.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;target.setPointerCapture(e.pointerId);});target.addEventListener('pointermove',e=>{if(!dragging)return;rz+=(e.clientX-lx)*0.008;rx+=(e.clientY-ly)*0.008;lx=e.clientX;ly=e.clientY;draw();});target.addEventListener('pointerup',()=>{dragging=false;});target.addEventListener('wheel',e=>{e.preventDefault();zoom*=e.deltaY>0?0.9:1.1;zoom=Math.max(0.025,Math.min(0.12,zoom));draw();},{passive:false});}
bindCanvasEvents(canvas);
document.getElementById('scale').addEventListener('input',e=>updateScale(e.target.value));
document.querySelectorAll('button[data-scale]').forEach(b=>b.addEventListener('click',()=>updateScale(b.dataset.scale)));
document.getElementById('reset').addEventListener('click',()=>{rx=-0.92;rz=-0.72;zoom=0.052;updateScale(120);});
document.getElementById('wire').addEventListener('change',draw);document.getElementById('patch').addEventListener('change',draw);window.addEventListener('resize',draw);
function setupFrameControls(){const fieldBox=document.getElementById('fieldControls'),fieldSelect=document.getElementById('fieldSelect'),stageBox=document.getElementById('stageControls'),stageSlider=document.getElementById('stageSlider'),stageLabel=document.getElementById('stageLabel');if(fieldBox&&fieldSelect&&FIELD_OPTIONS.length>1){fieldBox.style.display='block';fieldSelect.innerHTML=FIELD_OPTIONS.map(f=>'<option value="'+f.field+'">'+f.label+'</option>').join('');fieldSelect.value=activeField;fieldSelect.addEventListener('change',e=>{activeField=e.target.value;updateLegend();draw();});}if(stageBox&&stageSlider&&stageLabel&&STAGE_OPTIONS.length>1){stageBox.style.display='block';stageSlider.max=String(STAGE_OPTIONS.length-1);stageSlider.value=String(STAGE_OPTIONS.findIndex(s=>s.stageIndex===activeStage));stageLabel.textContent=STAGE_OPTIONS.find(s=>s.stageIndex===activeStage)?.label||'Final';stageSlider.addEventListener('input',e=>{const selected=STAGE_OPTIONS[Number(e.target.value)]||STAGE_OPTIONS[0];activeStage=selected.stageIndex;stageLabel.textContent=selected.label;updateLegend();draw();});}}
setupFrameControls();
updateLegend();
const statRows=[['Max settlement',MANIFEST.envelope.maxSettlementMm.toFixed(2)+' mm']];if(Number.isFinite(MANIFEST.envelope.maxHorizontalDisplacementMm)){statRows.push(['Max horizontal displacement',MANIFEST.envelope.maxHorizontalDisplacementMm.toFixed(2)+' mm']);}if(Number.isFinite(MANIFEST.envelope.maxWallDeflectionMm)){statRows.push(['Max wall deflection proxy',MANIFEST.envelope.maxWallDeflectionMm.toFixed(2)+' mm']);}if(Number.isFinite(MANIFEST.envelope.stageCount)){statRows.push(['Stages',String(MANIFEST.envelope.stageCount)]);}if(Number.isFinite(MANIFEST.envelope.volumeLossPercent)){statRows.push(['Volume loss',MANIFEST.envelope.volumeLossPercent.toFixed(2)+'%']);}if(Number.isFinite(MANIFEST.envelope.tunnelAxisDepthM)){statRows.push(['Tunnel axis depth',MANIFEST.envelope.tunnelAxisDepthM.toFixed(2)+' m']);}if(Number.isFinite(MANIFEST.envelope.troughWidthM)){statRows.push(['Trough width i',MANIFEST.envelope.troughWidthM.toFixed(2)+' m']);}if(Number.isFinite(MANIFEST.envelope.settlementVolumeM3)){statRows.push(['Settlement volume',MANIFEST.envelope.settlementVolumeM3.toFixed(3)+' m3']);}if(MANIFEST.analysisCase?.objective!=='tunnel_volume_loss_settlement'||MANIFEST.envelope.totalLoadKn>0){statRows.push(['Total load / excavated weight',MANIFEST.envelope.totalLoadKn.toFixed(0)+' kN'],['Reaction',MANIFEST.envelope.reactionKn.toFixed(0)+' kN'],['Balance',MANIFEST.envelope.reactionBalanceRatio.toFixed(3)]);}statRows.push(['Mesh',MANIFEST.mesh.divisions.join(' x ')+' hex8'],['Nodes / elements',MANIFEST.mesh.nodes+' / '+MANIFEST.mesh.elements]);document.getElementById('stats').innerHTML=statRows.map(r=>'<span>'+r[0]+'</span><span>'+r[1]+'</span>').join('');
requestAnimationFrame(draw);
</script>
</body>
</html>`;
}
