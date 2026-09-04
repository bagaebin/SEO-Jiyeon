/* ─────────────────────────────────────────────────────────────
   SEO Jiyeon — Digital Business Card   (26.09.04 노트 구현)

   화면 전체가 흰 종이다.
   ① 한 지점을 터치해 다른 지점으로 끌고 가 사각형을 그린다.
      그린 영역은 안쪽 그림자로만 표시되고, 텍스트는 아직 없다
   ② 그려진 사각형의 너비·비율에 따라 조판을 실시간으로 계산한다
   ③ 사각형을 탭하면 그 조각이 들렸다가 아래로 떨어지고,
      구멍 안에 텍스트가 흰색으로 드러난다
   ④ 각 정보를 터치하면 contact 된다
   ⑤ 새로 사각형을 그리면 열려 있던 구멍이 사각형 그대로 좁아지며 닫힌다
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
/* 드래그 중에는 실제 지점을 그대로 따라간다.
   손을 뗐을 때 이보다 작으면 '명함 비율'의 최소 크기까지 자라난다.
   폭 120px 은 최소 폰트(아래 MIN_NAME)로도 이름 한 줄이 온전히 들어가는 크기 */
const CARD_RATIO = 91 / 55;
const MIN_CARD_W = 120;
const MIN_CARD_H = MIN_CARD_W / CARD_RATIO;   // ≈ 72.5
const GROW_MS    = 380;                       // style.css 의 --grow 와 맞출 것
const TAP      = 10;                       // 이 이하 이동은 드로잉이 아니라 탭
const CLOSE_MS = 460;                      // style.css 의 --close 와 맞출 것
const LH       = 1.06;                     // style.css 의 .f line-height 와 맞출 것

/* 가독성 하한. 사각형이 작아져도 이 아래로는 줄이지 않고,
   그래도 넘치면 줄바꿈 → 줄임표(…) 로 처리한다 */
const MIN_NAME = 18, MIN_META = 11;

/* 각 슬롯이 쓸 수 있는 행 밴드(16 × 12 중 세로 행 수).
   r3 과 r8 은 그룹 사이 여백으로 항상 비운다 */
const BAND = { role:3, places:3, name:4, email:3, phone:3 };

const stage   = document.getElementById('stage');
const card    = document.getElementById('card');
const content = document.getElementById('content');
const sheet   = document.getElementById('sheet');
const panel   = {
  top   : document.getElementById('pn-top'),
  bottom: document.getElementById('pn-bottom'),
  left  : document.getElementById('pn-left'),
  right : document.getElementById('pn-right')
};
const camEl = document.getElementById('cam');

/* ── 내용 주입 ─────────────────────────────────────────────── */
const slot = s => content.querySelector(`[data-slot="${s}"]`);
const setText = (s, v) => { slot(s).querySelector('.t').textContent = v; };

setText('role',   CONTACT.role);
setText('places', CONTACT.places);
setText('name',   CONTACT.name);

const mail = slot('email');
mail.href = `mailto:${CONTACT.email}`;
{
  // 줄바꿈이 필요하면 '@' 뒤에서 먼저 끊는다
  const at = CONTACT.email.indexOf('@');
  const t = mail.querySelector('.t');
  if (at < 0) t.textContent = CONTACT.email;
  else t.append(CONTACT.email.slice(0, at + 1),
                document.createElement('wbr'),
                CONTACT.email.slice(at + 1));
}

slot('phone').replaceChildren(...CONTACT.phones.map(p => {
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

/* ── ② 사각형 → 조판 실시간 계산 ───────────────────────────── */
let rect = null;

function draw(r){
  rect = r;

  card.style.transform = `translate(${r.x}px, ${r.y}px)`;
  card.style.width  = r.w + 'px';
  card.style.height = r.h + 'px';

  // 그리드 한 칸을 기준 단위로 삼는다 → 너비와 비율이 동시에 반영된다
  const unit = Math.min(r.w / GRID.cols, r.h / GRID.rows);
  const row  = r.h / GRID.rows;

  // 이름은 가로폭에도 맞춰 캡을 건다 (정보 누락 방지: 이름은 늘 읽혀야 함)
  const fitW = r.w / (0.60 * Math.max(CONTACT.name.length, 1));
  let name = Math.max(Math.min(unit * 2.05, fitW), MIN_NAME);
  let meta = Math.max(Math.min(unit * 0.80, name * 0.46), MIN_META);

  // 밴드 안에 몇 줄이 들어가는지. 한 줄도 못 들어가면 그 항목은 접는다
  const fit = (s, fontPx, rows) => {
    const el = slot(s);
    const ts = el.querySelectorAll('.t');
    const n  = Math.floor(rows * row / Math.max(ts.length, 1) / (fontPx * LH));
    ts.forEach(t => t.style.setProperty('--lines', Math.max(n, 1)));
    return n;
  };

  let folded = 0;
  for (const s of ['role', 'places', 'email', 'phone']){
    const hide = fit(s, meta, BAND[s]) < 1;
    slot(s).hidden = hide;
    if (hide) folded++;
  }

  // 넷 다 접혔으면 이름만 남기고 면적을 전부 내준다
  const nameOnly = folded === 4;
  card.classList.toggle('min', nameOnly);
  if (nameOnly) name = Math.max(Math.min(r.h * 0.62, fitW), MIN_NAME);
  fit('name', name, nameOnly ? GRID.rows : BAND.name);

  card.style.setProperty('--name', name.toFixed(2) + 'px');
  card.style.setProperty('--meta', meta.toFixed(2) + 'px');
}

/* 드래그한 두 지점을 그대로 사각형으로 (화면 밖으로만 나가지 않게) */
function normalize(ax, ay, bx, by){
  return fitInView({
    x: Math.min(ax, bx), y: Math.min(ay, by),
    w: Math.abs(bx - ax), h: Math.abs(by - ay)
  });
}

function fitInView(r){
  const W = stage.clientWidth, H = stage.clientHeight;
  const w = Math.min(Math.max(r.w, 1), W);
  const h = Math.min(Math.max(r.h, 1), H);
  return {
    x: Math.max(0, Math.min(r.x, W - w)),
    y: Math.max(0, Math.min(r.y, H - h)),
    w, h
  };
}

/* 손을 뗀 뒤 — 최소 크기보다 작게 그렸으면 명함 비율의 최소 크기까지 자라난다.
   중심은 그린 자리를 그대로 지킨다 */
let growTimer = null;
function settle(r){
  if (r.w >= MIN_CARD_W && r.h >= MIN_CARD_H) return;

  const target = fitInView({
    x: r.x + r.w / 2 - MIN_CARD_W / 2,
    y: r.y + r.h / 2 - MIN_CARD_H / 2,
    w: MIN_CARD_W, h: MIN_CARD_H
  });

  card.classList.add('grow');
  draw(target);
  clearTimeout(growTimer);
  growTimer = setTimeout(() => card.classList.remove('grow'), GROW_MS);
}

function defaultRect(){
  const W = stage.clientWidth, H = stage.clientHeight;
  const w = Math.min(W * 0.78, 520, H * 0.72 * (91 / 55));
  return { x: (W - w) / 2, y: (H - w * 55 / 91) / 2, w, h: w * 55 / 91 };
}

/* ── ③⑤ 구멍 ───────────────────────────────────────────────
   구멍 자체는 그리지 않는다. 네 장의 흰 판이 구멍 둘레를 채울 뿐이다. */
let hole = null, closeTimer = null;

const place = (el, x, y, w, h) => {
  el.style.left   = x + 'px';
  el.style.top    = y + 'px';
  el.style.width  = Math.max(0, w) + 'px';
  el.style.height = Math.max(0, h) + 'px';
};

function paintHole(h){
  const W = window.innerWidth, H = window.innerHeight;
  place(panel.top,    0,         0,         W,               h.y);
  place(panel.bottom, 0,         h.y + h.h, W,               H - (h.y + h.h));
  place(panel.left,   0,         h.y,       h.x,             h.h);
  place(panel.right,  h.x + h.w, h.y,       W - (h.x + h.w), h.h);
}

const collapsed = h => ({ x: h.x + h.w / 2, y: h.y + h.h / 2, w: 0, h: 0 });

function openHole(){
  clearTimeout(closeTimer);
  card.classList.remove('grow');     // 자라는 중이었다면 즉시 마무리하고 뚫는다
  hole = { ...rect };
  sheet.classList.remove('anim');     // 구멍은 즉시 열리고, 조각이 떨어지며 드러난다
  paintHole(hole);
  void sheet.offsetWidth;
  card.classList.add('punched');
}

/* hideFlap: 같은 자리에서 닫을 때는 조각이 구멍을 가리지 않도록 잠시 비켜 준다 */
function closeHole({ hideFlap }){
  if (!hole) return;
  card.classList.remove('punched');
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
  askCameraOnce();                    // 첫 조작에서 카메라를 한 번 더 청한다
  start = { x: e.clientX, y: e.clientY };
  dragged = false;
  // 포인터 캡처는 '드래그가 시작된 뒤'에만 건다.
  // 여기서 미리 잡으면 탭의 click 대상이 stage 로 바뀌어 ④ contact 가 죽는다.
});

stage.addEventListener('pointermove', e => {
  if (!start) return;
  if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP) return;

  if (!dragged){
    dragged = true;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    closeHole({ hideFlap: false });   // 열려 있던 구멍은 닫으면서 새로 그린다
    card.classList.add('on');
  }
  draw(normalize(start.x, start.y, e.clientX, e.clientY));   // 실시간 재계산
});

function endDrag(e){
  if (!start) return;
  const from = start;
  start = null;

  if (dragged){
    const r = normalize(from.x, from.y, e.clientX, e.clientY);
    draw(r);
    settle(r);                       // 너무 작으면 명함 비율로 자라난다
    return;
  }
  // 움직임이 없었던 탭 — 사각형 안쪽이고 정보 위가 아니라면 뚫거나 닫는다
  if (card.classList.contains('on') && !e.target.closest('.act') && card.contains(e.target)){
    hole ? closeHole({ hideFlap: true }) : openHole();
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { start = null; });

/* 드래그로 끝난 포인터가 링크 클릭으로 새는 것을 막는다.
   (e.detail === 0 은 키보드 Enter → 그대로 통과시킨다) */
card.addEventListener('click', e => {
  if (dragged && e.detail !== 0){ e.preventDefault(); e.stopPropagation(); }
}, true);

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

/* ── 카메라: 허용하면 구멍으로 실시간 화면, 아니면 하늘 사진 ── */
let camAsked = false;

async function startCamera(){
  if (!navigator.mediaDevices?.getUserMedia) return;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
    camEl.srcObject = stream;
    camEl.play().catch(() => {});
    document.body.classList.add('cam-on');
  }catch{
    document.body.classList.remove('cam-on');   // → assets/sky.jpg
  }
}

/* iOS 등은 사용자 제스처가 있어야 카메라를 내준다. 첫 조작에서 한 번만 다시 청한다 */
function askCameraOnce(){
  if (camAsked || document.body.classList.contains('cam-on')) return;
  camAsked = true;
  startCamera();
}

/* ── 시작 ───────────────────────────────────────────────────── */
draw(defaultRect());                   // 사각형은 잡아두되 보이지 않는다
paintHole({ x: 0, y: 0, w: 0, h: 0 }); // 구멍 없이 흰 종이로 시작
startCamera();
