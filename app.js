/* ─────────────────────────────────────────────────────────────
   SEO Jiyeon — Digital Business Card   (26.09.04 노트 구현)

   ① 화면의 한 지점을 터치해 다른 지점으로 끌고 가 사각형을 그린다
   ② 그려진 사각형의 너비·비율에 따라 조판을 실시간으로 계산한다
   ③ 각 정보를 터치하면 contact 된다
   ★ 카메라 미허용 시 임시 하늘 사진으로 대체한다
   ───────────────────────────────────────────────────────────── */

/* 명함에 실릴 정보 — 실제 값으로 교체해서 쓰세요. */
const CONTACT = {
  name  : 'SEO Jiyeon',
  role  : 'Director',
  places: ['Busan', 'Paris'],
  email : 'hello@seojiyeon.studio',
  phone : { label: '+82 10 1234 5678', dial: '+821012345678' }
};

const GRID = { cols: 16, rows: 12 };   // 노트: 16 × 12 Grid
const MIN_W = 40, MIN_H = 28;          // 사각형 최소 크기(px)
const TAP   = 10;                      // 이 이하 이동은 드로잉이 아니라 탭

const stage   = document.getElementById('stage');
const card    = document.getElementById('card');
const readout = document.getElementById('readout');
const roSize  = document.getElementById('ro-size');
const roRatio = document.getElementById('ro-ratio');
const hint    = document.getElementById('hint');
const camEl   = document.getElementById('cam');
const btnCam  = document.getElementById('btn-cam');
const btnGrid = document.getElementById('btn-grid');
const btnReset= document.getElementById('btn-reset');

const elName  = card.querySelector('[data-slot="name"]');
const elRole  = card.querySelector('[data-slot="role"]');
const elMail  = card.querySelector('[data-slot="email"]');
const elPhone = card.querySelector('[data-slot="phone"]');
const elPlaces= card.querySelector('[data-slot="places"]');

/* ── 내용 주입 ─────────────────────────────────────────────── */
const txt = (slot, value) => { slot.querySelector('.t').textContent = value; };

txt(elName, CONTACT.name);
txt(elRole, CONTACT.role);
elPlaces.innerHTML = CONTACT.places
  .map(p => `<span class="t"></span>`).join('');
CONTACT.places.forEach((p, i) => { elPlaces.children[i].textContent = p; });
txt(elMail,  CONTACT.email);
txt(elPhone, CONTACT.phone.label);
elMail.href  = `mailto:${CONTACT.email}`;
elPhone.href = `tel:${CONTACT.phone.dial}`;

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

  // 사각형이 극단적으로 작을 때만 이름만 남긴다(정보 누락 방지의 최후 방어선).
  // 그 위 구간에서는 모든 정보를 유지하고 넘치는 부분만 줄임표로 처리한다.
  const tiny = unit < 4.0;
  card.classList.toggle('min', tiny);
  if (tiny) name = Math.min(r.h * 0.62, fitW);

  card.style.setProperty('--name', Math.max(name, 7).toFixed(2) + 'px');
  card.style.setProperty('--meta', Math.max(meta, 7).toFixed(2) + 'px');

  // 실시간 값 표시
  roSize.textContent  = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  roRatio.textContent = `RATIO ${(r.w / Math.max(r.h, 1)).toFixed(2)}`;
  const above = r.y > 26;
  readout.style.left = r.x + 'px';
  readout.style.top  = (above ? r.y - 20 : r.y + r.h + 8) + 'px';
}

function normalize(ax, ay, bx, by){
  const W = stage.clientWidth, H = stage.clientHeight;
  let x = Math.min(ax, bx), y = Math.min(ay, by);
  let w = Math.max(Math.abs(bx - ax), MIN_W);
  let h = Math.max(Math.abs(by - ay), MIN_H);
  w = Math.min(w, W); h = Math.min(h, H);
  x = Math.max(0, Math.min(x, W - w));
  y = Math.max(0, Math.min(y, H - h));
  return { x, y, w, h };
}

/* 기본값: 표준 명함 비율(91:55)로 화면 중앙에 한 장 놓아둔다 */
function defaultRect(){
  const W = stage.clientWidth, H = stage.clientHeight;
  const w = Math.min(W * 0.78, 520, H * 0.72 * (91 / 55));
  const h = w * (55 / 91);
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
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
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (!dragged && Math.hypot(dx, dy) < TAP) return;

  if (!dragged){
    dragged = true;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    document.body.classList.add('drawing');
    card.classList.add('on');
    hint.classList.add('done');
  }
  draw(normalize(start.x, start.y, e.clientX, e.clientY));   // 실시간 재계산
});

function endDrag(e){
  if (!start) return;
  if (dragged) draw(normalize(start.x, start.y, e.clientX, e.clientY));
  start = null;
  document.body.classList.remove('drawing');
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

/* 드래그로 끝난 포인터가 링크 클릭으로 새는 것을 막는다.
   (e.detail === 0 은 키보드 Enter 로 연 것 → 그대로 통과시킨다) */
card.addEventListener('click', e => {
  if (dragged && e.detail !== 0){ e.preventDefault(); e.stopPropagation(); }
}, true);

/* ── 크롬 ───────────────────────────────────────────────────── */
btnGrid.addEventListener('click', () => {
  const on = document.body.classList.toggle('grid-on');
  btnGrid.setAttribute('aria-pressed', String(on));
});

btnReset.addEventListener('click', () => {
  card.classList.add('on');
  hint.classList.add('done');
  draw(defaultRect());
});

/* 뷰포트가 바뀌면 그려둔 사각형을 비율 그대로 옮긴다 */
let prevW = window.innerWidth, prevH = window.innerHeight;
window.addEventListener('resize', () => {
  const W = window.innerWidth, H = window.innerHeight;
  if (rect && prevW && prevH){
    const sx = W / prevW, sy = H / prevH;
    draw(normalize(rect.x * sx, rect.y * sy,
                   (rect.x + rect.w) * sx, (rect.y + rect.h) * sy));
  }
  prevW = W; prevH = H;
});

/* ── ★ 카메라: 허용 시 실시간 배경, 아니면 임시 하늘 사진 ──── */
async function startCamera(){
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
    camEl.srcObject = stream;
    await camEl.play().catch(() => {});
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
draw(defaultRect());
requestAnimationFrame(() => card.classList.add('on'));
startCamera();
