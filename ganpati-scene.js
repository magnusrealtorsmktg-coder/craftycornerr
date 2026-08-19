/* =============================================================================
   Ganpati cinematic — GPU particle sequence (Three.js + GLSL + UnrealBloom)
   -----------------------------------------------------------------------------
   Divine energy → spiral attraction → ॐ (Om) → dissolve & reform → Ganpati Bappa
   → golden dust → Bappa settles back into a serene, breathing resting state.

   Everything is particles. No images, no textures, no models: the ॐ and the
   Ganesha silhouette are rasterised offscreen ONCE and their pixels sampled into
   per-particle target positions, which the vertex shader morphs between on the GPU.

   Loaded lazily and only in the Ganpati theme. Renders only while on screen.
   ========================================================================== */

export const CONFIG = {
  count: 14000,             // desktop particle count (auto-reduced on mobile)
  countMobile: 6000,
  duration: 8.2,            // seconds of the full cinematic before the resting state
  // Festive 'rangoli powder' palette, painted top→bottom over the murti as dithered
  // horizontal bands (saffron crown → vermilion → rani pink → purple → blue → green base).
  // Saturated mid-dark tones: bright enough to look colourful, dark enough to read
  // clearly on the cream centre of the mandap artwork (normal blending, NOT additive).
  colors: ['#E8940A', '#D33115', '#DB2777', '#7C3AED', '#2563C9', '#1F8A3B'],
  bloom: { strength: 0.55, radius: 0.55, threshold: 0.35 },
  shapeHeight: 2.9,         // world units tall
  // Detailed Ganesha line-art. Its dark lines become the particle targets.
  // If this file is missing, we fall back to the built-in silhouette below.
  ganeshaArt: 'ganesha-art.png',
};

const isGanpati = () => document.documentElement.getAttribute('data-theme') === 'ganpati';
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
let booted = false;

/* ---------- offscreen rasterise + pixel sampling ------------------------- */
const RAST = 512;

function rasterOm() {
  const c = document.createElement('canvas');
  c.width = c.height = RAST;
  const x = c.getContext('2d');
  x.clearRect(0, 0, RAST, RAST);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `700 ${Math.round(RAST * 0.78)}px "Noto Serif Devanagari", serif`;
  x.fillText('ॐ', RAST / 2, RAST / 2 + RAST * 0.02);   // ॐ
  return c;
}

const GANESHA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420"><g fill="#fff"><circle cx="200" cy="14" r="9"/><path d="M200,24 C214,44 232,60 244,86 C230,80 214,77 200,77 C186,77 170,80 156,86 C168,60 186,44 200,24 Z"/><path d="M150,84 C168,74 184,70 200,70 C216,70 232,74 250,84 L254,104 C232,94 216,90 200,90 C184,90 168,94 146,104 Z"/><ellipse cx="200" cy="176" rx="72" ry="78"/><path d="M150,120 C108,106 62,126 50,168 C40,206 62,252 104,262 C136,268 152,244 152,214 Z"/><path d="M250,120 C292,106 338,126 350,168 C360,206 338,252 296,262 C264,268 248,244 248,214 Z"/><path d="M166,242 C156,264 150,284 158,296 C170,286 178,262 180,244 Z"/><path d="M234,242 C244,264 250,284 242,296 C230,286 222,262 220,244 Z"/></g><path d="M200,228 C199,268 190,300 172,326 C154,350 126,356 116,338 C107,322 120,308 134,314" fill="none" stroke="#fff" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Rasterise any image (URL or data-URI), fitted + centred into a RAST square. */
function rasterImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = RAST;
      const x = c.getContext('2d');
      const s = Math.min(RAST * 0.96 / img.width, RAST * 0.96 / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, (RAST - w) / 2, (RAST - h) / 2, w, h);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

const rasterGanesha = () => rasterImage('data:image/svg+xml,' + encodeURIComponent(GANESHA_SVG));

/**
 * Extract points, then resample to exactly N per-particle targets.
 * mode 'alpha' → opaque pixels  (silhouettes / the ॐ glyph)
 * mode 'dark'  → dark pixels    (black-line artwork on a light background)
 */
function targetsFrom(canvas, N, height, mode = 'alpha') {
  if (!canvas) return null;
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const src = [];
  const stepPx = mode === 'dark' ? 1 : 2;          // line art is thin — sample every pixel
  for (let y = 0; y < h; y += stepPx)
    for (let x = 0; x < w; x += stepPx) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      if (mode === 'dark') {
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (a > 40 && lum < 135) src.push(x, y);   // the drawn lines
      } else if (a > 120) src.push(x, y);
    }
  const n = src.length / 2;
  if (!n) return null;

  const S = height / h;                       // px → world units
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const k = (Math.random() * n) | 0;
    const px = src[k * 2], py = src[k * 2 + 1];
    out[i * 3]     = (px - w / 2) * S + (Math.random() - 0.5) * 0.012;
    out[i * 3 + 1] = -(py - h / 2) * S + (Math.random() - 0.5) * 0.012;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.14;      // slight depth
  }
  return out;
}

/* ---------- shaders ------------------------------------------------------ */
const VERT = /* glsl */`
uniform float uTime, uOm, uGan, uDissolve, uSwirl, uDrift, uSize, uPR;
attribute vec3 aScatter, aOm, aGan, aRand, aColor;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 spin(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x*c-p.y*s, p.x*s+p.y*c, p.z); }

void main(){
  vColor = aColor;
  float r1 = aRand.x*2.0-1.0;

  /* Scene 1 — free-floating cosmic dust, drifting on simplex noise */
  vec3 nz = vec3(
    snoise(aScatter*0.22 + vec3(uTime*0.07, 0.0, 0.0)),
    snoise(aScatter*0.22 + vec3(0.0, uTime*0.07, 11.0)),
    snoise(aScatter*0.22 + vec3(7.0, 0.0, uTime*0.07))
  );
  vec3 pos = aScatter + nz * uDrift;

  /* Scenes 2–3 — spiral inward and assemble the ॐ (never straight lines) */
  pos = mix(pos, aOm, uOm);
  pos = spin(pos, uSwirl * r1 * uOm * (1.0 - uOm) * 7.0);

  /* Scene 4 — the ॐ lets go, swirls outward, then reorganises into Bappa */
  float bulge = uGan * (1.0 - uGan) * 4.0;                  // peaks mid-morph
  pos = mix(pos, aGan, uGan);
  pos += normalize(pos + 0.0001) * bulge * 0.55;
  pos = spin(pos, uSwirl * r1 * uGan * (1.0 - uGan) * 7.0);

  /* Scene 5 — gentle breathing once present */
  float formed = max(uOm, uGan);
  pos += normalize(pos + 0.0001) * sin(uTime * 1.1 + aRand.y * 6.2831) * 0.018 * formed;

  /* Scene 6 — dissolve upward into golden dust (then it settles back) */
  float dis = uDissolve;
  pos.y += dis * (1.2 + aRand.z * 2.6);
  pos.x += dis * r1 * 0.9;
  pos.z += dis * (aRand.y - 0.5) * 0.9;
  pos = spin(pos, dis * r1 * 1.4);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // fine dust: a few CSS px per particle (additive, so keep these small or they blow out)
  gl_PointSize = aSize * uSize * uPR * (9.0 / max(0.001, -mv.z));

  float tw = 0.80 + 0.20 * sin(uTime * 2.1 + aRand.z * 21.0);   // gentle shimmer
  vAlpha = tw * 0.95 * (1.0 - dis * 0.85);
}
`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if(d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, 1.8);   // slightly solider dots so the powder colours stay vivid on cream
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/* ---------- boot --------------------------------------------------------- */
async function boot() {
  if (booted || !isGanpati()) return;
  const sec = document.getElementById('gnScene');
  const canvas = document.getElementById('gnCanvas');
  if (!sec || !canvas) return;
  booted = true;

  const THREE = await import('three');

  const mobile = innerWidth < 820;
  const N = mobile ? CONFIG.countMobile : CONFIG.count;

  // make sure the ॐ glyph is available before we rasterise it
  try { await document.fonts.load('700 100px "Noto Serif Devanagari"', 'ॐ'); await document.fonts.ready; } catch (e) {}

  const omTargets = targetsFrom(rasterOm(), N, CONFIG.shapeHeight, 'alpha');

  // Prefer the detailed line-art (its strokes become the particles); else the built-in silhouette.
  let ganTargets = null, ganSrc = 'built-in silhouette';
  const art = await rasterImage(CONFIG.ganeshaArt);
  if (art) { ganTargets = targetsFrom(art, N, CONFIG.shapeHeight, 'dark'); if (ganTargets) ganSrc = CONFIG.ganeshaArt; }
  if (!ganTargets) ganTargets = targetsFrom(await rasterGanesha(), N, CONFIG.shapeHeight, 'alpha');
  if (!omTargets || !ganTargets) { console.warn('[ganpati] could not rasterise shapes'); return; }
  console.info('[ganpati] Ganesha source:', ganSrc);

  /* --- renderer / scene --- */
  // The canvas is fully transparent: the mandap artwork (CSS background on .gn-scene)
  // shows through, and the dark particles are drawn with normal blending on top of it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);


  /* --- particle geometry --- */
  const pal = CONFIG.colors.map(h => new THREE.Color(h));
  const g = new THREE.BufferGeometry();
  const scatter = new Float32Array(N * 3);
  const rand = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // start scattered through a wide 3D volume
    const r = 3.2 + Math.random() * 4.0, a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    scatter[i * 3] = Math.cos(a) * s * r * 1.15;
    scatter[i * 3 + 1] = u * r * 0.8;
    scatter[i * 3 + 2] = Math.sin(a) * s * r * 0.55 - 0.5;
    rand[i * 3] = Math.random(); rand[i * 3 + 1] = Math.random(); rand[i * 3 + 2] = Math.random();
    // colour from the particle's position in the formed murti: horizontal palette bands
    // top→bottom, dithered at the edges so they blend like sprinkled rangoli powder
    const ty = ganTargets[i * 3 + 1];
    const f = (0.5 - ty / CONFIG.shapeHeight) * pal.length + (Math.random() - 0.5) * 1.35;
    const c = pal[Math.max(0, Math.min(pal.length - 1, f | 0))];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.55 + Math.random() * 1.5;
  }
  g.setAttribute('position', new THREE.BufferAttribute(scatter.slice(), 3)); // required by three
  g.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  g.setAttribute('aOm', new THREE.BufferAttribute(omTargets, 3));
  g.setAttribute('aGan', new THREE.BufferAttribute(ganTargets, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

  const uni = {
    uTime: { value: 0 }, uOm: { value: 0 }, uGan: { value: 0 },
    uDissolve: { value: 0 }, uSwirl: { value: 0 }, uDrift: { value: 0.5 },
    uSize: { value: mobile ? 1.5 : 1.7 }, uPR: { value: Math.min(2, devicePixelRatio || 1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  scene.add(points);

  /* --- soft aura / god-rays behind the figure (additive radial glow) --- */
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,214,140,0.30)');
    gr.addColorStop(0.35, 'rgba(240,168,58,0.10)');
    gr.addColorStop(1, 'rgba(240,168,58,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 4.8),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
  );
  aura.position.z = -1.2;   // (not added: an additive gold glow is invisible on a cream backdrop)


  function resize() {
    const w = sec.clientWidth || innerWidth, h = sec.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the murti fully in frame on narrow screens
    camera.position.z = (w / h < 0.85) ? 8.6 : 6.2;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  /* --- timeline --------------------------------------------------------- */
  const sstep = (a, b, t) => { const x = (t - a) / (b - a); return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); };
  const cam0 = camera.position.z;

  function apply(t) {
    const uOm = sstep(1.2, 3.0, t);
    const uGan = sstep(3.6, 5.0, t);
    // dissolve up into dust… then let Bappa settle back and remain
    const up = sstep(5.8, 7.0, t), down = sstep(7.0, 8.2, t);
    const uDis = Math.max(0, up - down);
    const sw1 = Math.sin(Math.PI * sstep(1.2, 3.0, t));
    const sw2 = Math.sin(Math.PI * sstep(3.6, 5.0, t));

    uni.uOm.value = uOm;
    uni.uGan.value = uGan;
    uni.uDissolve.value = uDis;
    uni.uSwirl.value = Math.max(sw1, sw2);
    uni.uDrift.value = 0.5 * (1 - uOm) + 0.04;

    const present = Math.max(uOm * (1 - uGan * 0.35), uGan) * (1 - uDis * 0.8);
    aura.material.opacity = 0.16 * present;

    camera.position.z = cam0 - 1.15 * sstep(0, CONFIG.duration, t);   // slow push in
    sec.classList.toggle('show-cap', t > 5.0);
  }

  /* --- run: only while the section is on screen; cinematic plays once --- */
  let raf = 0, t0 = 0, started = false, visible = false;

  function frame(now) {
    if (!visible) { raf = 0; return; }
    if (!t0) t0 = now;
    const t = Math.min((now - t0) / 1000, CONFIG.duration + 40); // clamp; rest state after
    uni.uTime.value = (now - t0) / 1000;
    apply(Math.min(t, CONFIG.duration));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  if (reduced) {                       // accessibility: no cinematic, just a serene formed Bappa
    uni.uOm.value = 1; uni.uGan.value = 1; uni.uSwirl.value = 0; uni.uDrift.value = 0.03;
    aura.material.opacity = 0.16; sec.classList.add('show-cap');
    renderer.render(scene, camera);
  } else {
    new IntersectionObserver((es) => {
      es.forEach(e => {
        visible = e.isIntersecting;
        if (visible && !raf) { if (!started) { started = true; t0 = 0; } raf = requestAnimationFrame(frame); }
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
    }, { threshold: 0.85 }).observe(sec);  // start only once the cloud wipe has (nearly) cleared
  }
}

if (isGanpati()) boot();
document.addEventListener('themechange', boot);
