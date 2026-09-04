/* ─────────────────────────────────────────────────────────────
   SEO Jiyeon — Digital Business Card   (26.09.04 노트 구현)

   화면 전체가 흰 종이다.
   ① 한 지점을 터치해 다른 지점으로 끌고 가 사각형(마스킹 영역)을 그린다
   ② 그려진 사각형의 너비·비율에 따라 조판을 실시간으로 계산한다
   ③ 각 정보를 터치하면 contact 된다
   ④ 사각형을 탭하면 그 조각이 들렸다가 아래로 떨어지고 구멍이 남는다.
      구멍으로 카메라(없으면 하늘 사진)가 보이고 텍스트는 흰색으로 남는다
   ⑤ 새로 사각형을 그리면 열려 있던 구멍이 사각형 그대로 좁아지며 닫힌다
   ⑥ 기본 화면에는 아무것도 없다. 사각형을 그려야 그 크기에 맞춰 텍스트가 드러난다
   ───────────────────────────────────────────────────────────── */

const CONTACT = {
  name  : 'SEO Jiyeon',
  role  : 'Director',
  places: 'Busan, Paris',
  email : 'fishwaswater@gmail.com',
  phones: [                                   // 국가별로 2줄
    { label: '+82 10 5632 8631',   dial: '+821056328631' },
    { label: '+33 06 61 67 75 71', dial: '+33661677571'  }
  ]
};

const GRID     = { cols: 16, rows: 12 };   // 노트: 16 × 12 Grid
const MIN_W    = 40, MIN_H = 28;           // 사각형 최소 크기(px)
const TAP      = 10;                       // 이 이하 이동은 드로잉이 아니라 탭
const CLOSE_MS = 460;                      // style.css 의 --close 와 맞출 것
const LH       = 1.06;                     // style.css 의 .f line-height 와 맞출 것

/* 각 슬롯이 쓸 수 있는 행 밴드(16 × 12 중 세로 행 수).
   r3 과 r8 은 그룹 사이 여백으로 항상 비운다:
   r0-2 상단 · r3 여백 · r4-7 이름 · r8 여백 · r9-11 하단 */
const BAND = { role:3, places:3, name:4, email:3, phone:3 };

const stage   = document.getElementById('stage');
const card    = document.getElementById('card');
const flap    = document.getElementById('flap');
const content = document.getElementById('content');
const holeText= document.getElementById('hole-text');
const sheet   = document.getElementById('sheet');
const panel   = {
  top   : document.getElementById('pn-top'),
  bottom: document.getElementById('pn-bottom'),
  left  : document.getElementById('pn-left'),
  right : document.getElementById('pn-right')
};
const readout = document.getElementById('readout');
const roSize  = document.getElementById('ro-size');
const roRatio = document.getElementById('ro-ratio');
const hint    = document.getElementById('hint');
const camEl   = document.getElementById('cam');
const btnCam  = document.getElementById('btn-cam');
const btnGrid = document.getElementById('btn-grid');
const btnReset= document.getElementById('btn-reset');

/* ── 내용 주입 ─────────────────────────────────────────────── */
const setText = (slot, value) =>
  content.querySelector(`[data-slot="${slot}"] .t`).textContent = value;

setText('role',   CONTACT.role);
setText('places', CONTACT.places);
setText('name',   CONTACT.name);

const mail = content.querySelector('[data-slot="email"]');
mail.href = `mailto:${CONTACT.email}`;
{
  // 줄바꿈이 필요하면 '@' 뒤에서 먼저 끊는다.
  // (그래도 모자라면 CSS 의 overflow-wrap:anywhere 가 아무 데서나 끊는다)
  const at = CONTACT.email.indexOf('@');
  const t = mail.querySelector('.t');
  if (at < 0) t.textContent = CONTACT.email;
  else t.append(CONTACT.email.slice(0, at + 1),
                document.createElement('wbr'),
                CONTACT.email.slice(at + 1));
}

content.querySelector('[data-slot="phone"]').replaceChildren(
  ...CONTACT.phones.map(p => {
    const a = document.createElement('a');
    a.className = 'act';
    a.href = `tel:${p.dial}`;
    a.draggable = false;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = p.label;
    a.append(t);
    return a;
  })
);

/* 구멍 안에 남을 흰 텍스트 — 같은 내용, 같은 자리. 보이는 쪽만 조작을 받는다 */
holeText.replaceChildren(...[...content.children].map(n => n.cloneNode(true)));
function setActiveLayer(punched){
  holeText.inert = !punched;
  content.inert  = punched;
  holeText.setAttribute('aria-hidden', String(!punched));
  content.setAttribute('aria-hidden', String(punched));
}
setActiveLayer(false);

/* ── ② 사각형 → 조판 실시간 계산 ───────────────────────────── */
let rect = null;

function draw(r){
  rect = r;

  card.style.transform = `translate(${r.x}px, ${r.y}px)`;
  card.style.width  = r.w + 'px';
  card.style.height = r.h + 'px';

  // 그리드 한 칸을 기준 단위로 삼는다 → 너비와 비율이 동시에 반영된다
  const unit = Math.min(r.w / GRID.cols, r.h / GRID.rows);

  // 이름은 가로폭에도 맞춰 캡을 건다 (정보 누락 방지: 이름은 늘 읽혀야 함)
  const fitW = r.w / (0.60 * Math.max(CONTACT.name.length, 1));
  let name = Math.min(unit * 2.05, fitW);
  let meta = Math.min(unit * 0.80, name * 0.46);

  // 사각형이 극단적으로 작을 때만 이름만 남긴다(정보 누락 방지의 최후 방어선)
  const tiny = unit < 4.0;
  card.classList.toggle('min', tiny);
  if (tiny) name = Math.min(r.h * 0.62, fitW);

  name = Math.max(name, 7);
  meta = Math.max(meta, 7);
  card.style.setProperty('--name', name.toFixed(2) + 'px');
  card.style.setProperty('--meta', meta.toFixed(2) + 'px');

  // 줄바꿈을 몇 줄까지 허용할지 — 밴드 높이 안에 들어가는 만큼만
  const row = r.h / GRID.rows;
  const lines = (slot, fontPx) => {
    const sel = `[data-slot="${slot}"] .t`;
    // 한 밴드를 나눠 쓰는 줄 수는 '한 층 기준'으로 센다(전화번호 2줄)
    const share = Math.max(content.querySelectorAll(sel).length, 1);
    const band  = (tiny && slot === 'name' ? GRID.rows : BAND[slot]) * row;
    const n = Math.max(1, Math.floor(band / share / (fontPx * LH)));
    for (const root of [content, holeText])
      root.querySelectorAll(sel).forEach(t => t.style.setProperty('--lines', n));
  };
  lines('role',   meta);
  lines('places', meta);
  lines('name',   name);
  lines('email',  meta);
  lines('phone',  meta);          // 번호 2개가 밴드를 나눠 쓴다

  roSize.textContent  = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  roRatio.textContent = `RATIO ${(r.w / Math.max(r.h, 1)).toFixed(2)}`;
  const above = r.y > 26;
  readout.style.left = r.x + 'px';
  readout.style.top  = (above ? r.y - 20 : r.y + r.h + 8) + 'px';
}

function normalize(ax, ay, bx, by){
  const W = stage.clientWidth, H = stage.clientHeight;
  let x = Math.min(ax, bx), y = Math.min(ay, by);
  let w = Math.min(Math.max(Math.abs(bx - ax), MIN_W), W);
  let h = Math.min(Math.max(Math.abs(by - ay), MIN_H), H);
  x = Math.max(0, Math.min(x, W - w));
  y = Math.max(0, Math.min(y, H - h));
  return { x, y, w, h };
}

/* 기본값: 표준 명함 비율(91:55)로 화면 중앙에 한 장 */
function defaultRect(){
  const W = stage.clientWidth, H = stage.clientHeight;
  const w = Math.min(W * 0.78, 520, H * 0.72 * (91 / 55));
  return { x: (W - w) / 2, y: (H - w * 55 / 91) / 2, w, h: w * 55 / 91 };
}

/* ── ④⑤ 구멍 ───────────────────────────────────────────────
   구멍 자체는 그리지 않는다. 네 장의 흰 판이 구멍 둘레를 채울 뿐이다.
   판을 움직이면 구멍이 사각형 그대로 열리고 닫힌다. */
let hole = null, closeTimer = null;

const place = (el, x, y, w, h) => {
  el.style.left   = x + 'px';
  el.style.top    = y + 'px';
  el.style.width  = Math.max(0, w) + 'px';
  el.style.height = Math.max(0, h) + 'px';
};

function paintHole(h){
  const W = window.innerWidth, H = window.innerHeight;
  place(panel.top,    0,         0,         W,                 h.y);
  place(panel.bottom, 0,         h.y + h.h, W,                 H - (h.y + h.h));
  place(panel.left,   0,         h.y,       h.x,               h.h);
  place(panel.right,  h.x + h.w, h.y,       W - (h.x + h.w),   h.h);
}

const collapsed = h => ({ x: h.x + h.w / 2, y: h.y + h.h / 2, w: 0, h: 0 });

function openHole(){
  clearTimeout(closeTimer);
  hole = { ...rect };
  sheet.classList.remove('anim');     // 구멍은 즉시 열린다. 대신 조각이 떨어지며 드러난다
  paintHole(hole);
  void sheet.offsetWidth;
  card.classList.add('punched');
  setActiveLayer(true);
}

/* hideFlap: 같은 자리에서 닫을 때는 조각이 구멍을 가리지 않도록 잠시 비켜 준다 */
function closeHole({ hideFlap }){
  if (!hole) return;
  card.classList.remove('punched');
  setActiveLayer(false);
  if (hideFlap) card.classList.add('closing');

  sheet.classList.add('anim');        // ⑤ 사각형 그대로 좁아진다
  paintHole(collapsed(hole));

  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    hole = null;
    sheet.classList.remove('anim');
    card.classList.remove('closing');
  }, CLOSE_MS);
}

/* ── ① 드래그로 사각형 그리기 ──────────────────────────────── */
let start = null, dragged = false;

stage.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return;
  start = { x: e.clientX, y: e.clientY };
  dragged = false;
  // 포인터 캡처는 '드래그가 시작된 뒤'에만 건다.
  // 여기서 미리 잡으면 탭의 click 대상이 stage 로 바뀌어 ③ contact 가 죽는다.
});

stage.addEventListener('pointermove', e => {
  if (!start) return;
  if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP) return;

  if (!dragged){
    dragged = true;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    document.body.classList.add('drawing');
    closeHole({ hideFlap: false });   // 열려 있던 구멍은 닫으면서 새로 그린다
    card.classList.add('on');
    hint.classList.add('done');
  }
  draw(normalize(start.x, start.y, e.clientX, e.clientY));   // 실시간 재계산
});

function endDrag(e){
  if (!start) return;
  const from = start;
  start = null;

  if (dragged){
    draw(normalize(from.x, from.y, e.clientX, e.clientY));
    document.body.classList.remove('drawing');
    return;
  }
  // 움직임이 없었던 탭 — 사각형 안쪽이고 정보 위가 아니라면 뚫거나 닫는다
  if (card.classList.contains('on') && !e.target.closest('.act') && card.contains(e.target)){
    hole ? closeHole({ hideFlap: true }) : openHole();
    hint.classList.add('done');
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => {
  start = null;
  document.body.classList.remove('drawing');
});

/* 드래그로 끝난 포인터가 링크 클릭으로 새는 것을 막는다.
   (e.detail === 0 은 키보드 Enter → 그대로 통과시킨다) */
card.addEventListener('click', e => {
  if (dragged && e.detail !== 0){ e.preventDefault(); e.stopPropagation(); }
}, true);

/* ── 크롬 ───────────────────────────────────────────────────── */
btnGrid.addEventListener('click', () => {
  btnGrid.setAttribute('aria-pressed',
    String(document.body.classList.toggle('grid-on')));
});

btnReset.addEventListener('click', () => {
  closeHole({ hideFlap: false });
  card.classList.add('on');
  hint.classList.add('done');
  draw(defaultRect());
});

/* 뷰포트가 바뀌면 그려둔 사각형과 구멍을 비율 그대로 옮긴다 */
let prevW = window.innerWidth, prevH = window.innerHeight;
window.addEventListener('resize', () => {
  const W = window.innerWidth, H = window.innerHeight;
  const sx = W / prevW, sy = H / prevH;
  if (rect) draw(normalize(rect.x * sx, rect.y * sy,
                           (rect.x + rect.w) * sx, (rect.y + rect.h) * sy));
  if (hole){
    hole = { x: hole.x * sx, y: hole.y * sy, w: hole.w * sx, h: hole.h * sy };
    sheet.classList.remove('anim');
    paintHole(hole);
  }
  prevW = W; prevH = H;
});

/* ── ★ 카메라: 허용하면 구멍으로 실시간 화면, 아니면 하늘 사진 ── */
async function startCamera(){
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
    camEl.srcObject = stream;
    camEl.play().catch(() => {});
    document.body.classList.add('cam-on');
    btnCam.hidden = true;
    return true;
  }catch{
    document.body.classList.remove('cam-on');   // → assets/sky.jpg
    btnCam.hidden = false;
    return false;
  }
}
btnCam.addEventListener('click', startCamera);

/* ── 시작 ───────────────────────────────────────────────────── */
// ⑥ 흰 종이만 있는 상태로 시작한다. 사각형을 그려야 텍스트가 드러난다.
draw(defaultRect());
paintHole({ x: 0, y: 0, w: 0, h: 0 });
startCamera();
