/* ─────────────────────────────────────────────────────────────
   SEO Jiyeon — Digital Business Card   (26.09.04 노트 구현)

   ① 화면의 한 지점을 터치해 다른 지점으로 끌고 가 사각형을 그린다
   ② 그려진 사각형의 너비·비율에 따라 조판을 실시간으로 계산한다
   ③ 각 정보를 터치하면 contact 된다
   ④ 사각형을 한 번 더 터치하면 흰 면이 그 지점에서부터 펀칭되어
      뒤쪽(카메라 / 카메라가 없으면 하늘 사진)이 드러나고,
      텍스트만 흰색으로 남는다
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

const GRID = { cols: 16, rows: 12 };   // 노트: 16 × 12 Grid
const MIN_W = 40, MIN_H = 28;          // 사각형 최소 크기(px)
const TAP   = 10;                      // 이 이하 이동은 드로잉이 아니라 탭

const stage   = document.getElementById('stage');
const card    = document.getElementById('card');
const content = document.getElementById('content');
const ghost   = document.getElementById('content-ghost');
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
mail.querySelector('.t').textContent = CONTACT.email;
mail.href = `mailto:${CONTACT.email}`;

const phone = content.querySelector('[data-slot="phone"]');
phone.replaceChildren(...CONTACT.phones.map(p => {
  const a = document.createElement('a');
  a.className = 'act';
  a.href = `tel:${p.dial}`;
  a.draggable = false;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = p.label;
  a.append(t);
  return a;
}));

/* 뚫린 자리에 남을 흰 텍스트 사본 — 보이기만 하고 조작은 아래 실제 내용이 받는다 */
function syncGhost(){
  ghost.replaceChildren(...[...content.children].map(n => n.cloneNode(true)));
  ghost.querySelectorAll('a').forEach(a => {
    a.removeAttribute('href');
    a.tabIndex = -1;
  });
}
syncGhost();

/* ── ② 사각형 → 조판 실시간 계산 ───────────────────────────── */
let rect = null;

function draw(r){
  rect = r;

  card.style.transform = `translate(${r.x}px, ${r.y}px)`;
  card.style.width  = r.w + 'px';
  card.style.height = r.h + 'px';

  // 펀칭된 창이 '뷰포트에 고정된 뒤쪽 층'처럼 보이도록 역보정
  card.style.setProperty('--wx', -r.x + 'px');
  card.style.setProperty('--wy', -r.y + 'px');

  // 그리드 한 칸을 기준 단위로 삼는다 → 너비와 비율이 동시에 반영된다
  const unit = Math.min(r.w / GRID.cols, r.h / GRID.rows);

  // 이름은 가로폭에도 맞춰 캡을 건다 (정보 누락 방지: 이름은 늘 읽혀야 함)
  const fitW = r.w / (0.60 * Math.max(CONTACT.name.length, 1));
  let name = Math.min(unit * 2.05, fitW);
  let meta = Math.min(unit * 0.80, name * 0.46);

  // 사각형이 극단적으로 작을 때만 이름만 남긴다(정보 누락 방지의 최후 방어선).
  // 그 위 구간에서는 모든 정보를 유지하고 넘치는 부분만 줄임표로 처리한다.
  const tiny = unit < 4.0;
  card.classList.toggle('min', tiny);
  if (tiny) name = Math.min(r.h * 0.62, fitW);

  card.style.setProperty('--name', Math.max(name, 7).toFixed(2) + 'px');
  card.style.setProperty('--meta', Math.max(meta, 7).toFixed(2) + 'px');
  card.style.setProperty('--pr', Math.hypot(r.w, r.h).toFixed(0) + 'px');

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

/* 기본값: 표준 명함 비율(91:55)로 화면 중앙에 한 장 놓아둔다 */
function defaultRect(){
  const W = stage.clientWidth, H = stage.clientHeight;
  const w = Math.min(W * 0.78, 520, H * 0.72 * (91 / 55));
  return { x: (W - w) / 2, y: (H - w * 55 / 91) / 2, w, h: w * 55 / 91 };
}

/* ── ④ 펀칭 ────────────────────────────────────────────────── */
function punchAt(clientX, clientY){
  const open = !card.classList.contains('punched');
  if (open){                                 // 뚫을 때만 중심을 옮긴다(닫을 땐 뚫린 자리로 되돌아간다)
    const b = card.getBoundingClientRect();
    card.style.setProperty('--px', (clientX - b.left).toFixed(0) + 'px');
    card.style.setProperty('--py', (clientY - b.top).toFixed(0) + 'px');
    void card.offsetWidth;                   // 중심을 먼저 확정한 뒤 반지름을 키운다
  }
  card.classList.toggle('punched', open);
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
    card.classList.remove('punched');     // 새로 그리면 흰 면부터 다시
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
  // 움직임이 없었던 탭 — 명함 안쪽이고 정보 위가 아니라면 펀칭
  if (!e.target.closest('.act') && card.contains(e.target)){
    punchAt(e.clientX, e.clientY);
    hint.classList.add('done');
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { start = null; document.body.classList.remove('drawing'); });

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
  card.classList.remove('punched');
  card.classList.add('on');
  hint.classList.add('done');
  draw(defaultRect());
});

/* 뷰포트가 바뀌면 그려둔 사각형을 비율 그대로 옮긴다 */
let prevW = window.innerWidth, prevH = window.innerHeight;
function syncViewport(){
  const W = window.innerWidth, H = window.innerHeight;
  document.documentElement.style.setProperty('--vw', W + 'px');
  document.documentElement.style.setProperty('--vh', H + 'px');
  if (rect && prevW && prevH){
    const sx = W / prevW, sy = H / prevH;
    draw(normalize(rect.x * sx, rect.y * sy,
                   (rect.x + rect.w) * sx, (rect.y + rect.h) * sy));
  }
  prevW = W; prevH = H;
}
window.addEventListener('resize', syncViewport);

/* ── ★ 카메라: 허용 시 실시간 배경, 아니면 하늘 사진이 펀칭 자리에 ── */
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
    // 카메라를 못 쓰면 뚫린 자리에 임시 하늘 사진이 드러난다
    document.body.classList.remove('cam-on');
    btnCam.hidden = false;
    return false;
  }
}
btnCam.addEventListener('click', startCamera);

/* ── 시작 ───────────────────────────────────────────────────── */
syncViewport();
draw(defaultRect());
requestAnimationFrame(() => card.classList.add('on'));
startCamera();
