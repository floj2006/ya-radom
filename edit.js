'use strict';
// Вся анимация считается от audio.currentTime: никаких таймеров и очередей твинов.
// Поэтому пауза, перемотка назад/вперёд и повтор всегда дают один и тот же кадр.

const $ = id => document.getElementById(id);
const audio = $('audio');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let fx = !reducedMotion.matches;
let started = false;
let raf = 0;
let width = innerWidth, height = innerHeight;
let viewW = 1, viewH = 1;

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const easeOut = n => 1 - Math.pow(1 - clamp(n), 4);
// Детерминированный «рандом»: одно и то же число для одного и того же n.
const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

// ===== Ритм =====
// Темп измерен по треку: 123 BPM, первая доля на 0.025 с.
const BPM = 123;
const BEAT = 60 / BPM;
const OFFSET = 0.025;
const SONG_END = 31.22;
const beatTime = b => OFFSET + b * BEAT;

// Насколько «жёстко» качает в каждом такте (такт = 4 доли). 1 — спокойнее, 3 — максимум.
const LEVELS = [2, 2, 2, 3,  1, 2, 2, 3,  2, 2, 2, 3,  2, 2, 1, 3];

// ===== Кадры =====
// Картинка + точка, на которой держим фокус (в % от картинки) + приближение.
const IMAGE_W = 1672, IMAGE_H = 941;
const FRAMINGS = {
  'p-wide':    ['platform', 60, 50, 1],
  'p-face':    ['platform', 74, 24, 2.4],
  'p-profile': ['platform', 80, 36, 1.5],
  'p-signal':  ['platform', 48, 43, 2.6],
  'p-lights':  ['platform', 63, 52, 2.8],
  'p-rails':   ['platform', 55, 82, 2],
  'p-sky':     ['platform', 25, 35, 1.8],
  'e-wide':    ['eyes', 45, 45, 1],
  'e-face':    ['eyes', 40, 40, 1.5],
  'e-eye':     ['eyes', 39, 22, 2.6],
  'e-tear':    ['eyes', 30, 52, 2.8],
  'e-lips':    ['eyes', 46, 68, 2.4],
  'e-city':    ['eyes', 82, 42, 2],
  's-wide':    ['summer', 50, 50, 1],
  's-couple':  ['summer', 50, 72, 2.6],
  's-sun':     ['summer', 30, 60, 2.8],
  's-moon':    ['summer', 70, 13, 3.2],
  's-clouds':  ['summer', 45, 22, 1.8],
  's-grass':   ['summer', 25, 88, 2.2]
};
// Цветовые режимы кадра.
const LOOKS = {
  mono: 'grayscale(1) contrast(1.5) brightness(1.05)',
  red: 'grayscale(1) sepia(1) saturate(7) hue-rotate(-45deg) contrast(1.25)',
  invert: 'invert(1) hue-rotate(180deg) contrast(1.2)'
};

// Монтаж: [доля, кадр, теги]. Доля может быть дробной (.5 = между ударами).
// Теги: zoom/whip — тип входа, flash — вспышка на склейке, flip — зеркало,
// mono/red/invert — цвет, push — медленный наезд, black — чёрный кадр.
const SHOTS = [
  // ДАЖЕ ЕСЛИ ВЕСЬ МИР
  [0, 'p-wide', 'zoom flash push'], [2, 'p-signal', 'whip'], [3, 'p-rails', 'flip'],
  // ПРОТИВ НАС
  [4, 'p-face', 'zoom flash'], [5, 'e-eye', 'mono'], [6, 'p-profile', 'whip'], [7, 'p-lights', 'red'], [7.5, 'p-face', 'invert'],
  // Я БУДУ РЯДОМ
  [8, 's-wide', 'zoom flash push'], [10, 's-couple', 'whip'], [11, 's-sun', ''],
  [12, 's-clouds', 'flip'], [13, 'e-face', 'whip'], [14, 'p-face', 'mono'], [14.5, 's-couple', 'red'], [15, '', 'black'], [15.5, 'e-eye', 'invert'],
  // ТВОИ УЛЫБКИ В ПАМЯТИ — передышка
  [16, 'e-wide', 'flash push'], [18, 'e-tear', 'push'],
  // ОСКОЛКИ ГЛАЗ
  [20, 'e-eye', 'zoom flash'], [21, 'e-eye', 'flip red'], [22, 'e-city', 'whip'], [23, 'e-lips', ''],
  // ПОСЛЕДСТВИЕ ЯДА
  [24, 'p-face', 'mono flash'], [25, 'e-tear', 'mono'], [26, 'p-lights', 'whip'], [27, 'e-face', 'red'],
  [28, 'p-profile', 'zoom'], [28.5, 'e-eye', 'invert'], [29, 'p-signal', 'red'], [29.5, 's-moon', 'mono'],
  [30, 'e-lips', 'zoom'], [30.5, '', 'black'], [31, 'p-face', 'invert'], [31.5, '', 'black'],
  // У ПОДНОЖИЯ ЛЕТА
  [32, 's-wide', 'zoom flash push'], [34, 's-grass', 'whip'], [35, 's-sun', ''],
  // МЫ ЖДЁМ ОТВЕТОВ
  [36, 's-couple', 'zoom flash'], [37, 's-clouds', 'flip'], [38, 'e-face', 'whip'], [39, 's-moon', ''],
  // КОТОРЫХ НЕТУ
  [40, 'p-face', 'zoom flash'], [41, 'p-face', 'flip mono'], [42, 'e-eye', ''], [43, 'p-sky', 'whip'],
  [44, 's-couple', 'mono'], [44.5, 'p-lights', ''], [45, 'e-lips', 'red'], [45.5, 's-sun', 'invert'],
  [46, 'p-signal', 'zoom'], [46.5, 'e-eye', 'mono'], [47, '', 'black'], [47.5, 'p-face', 'invert'],
  // ПОТОРОПИЛИСЬ БРОСИВ ВСЁ
  [48, 'p-wide', 'zoom flash'], [49, 'p-rails', 'whip flip'], [50, 's-couple', ''], [51, 'e-tear', ''],
  [52, 's-wide', 'flash'], [53, 'e-city', 'flip'], [54, 'p-profile', 'whip'], [55, 's-grass', 'red'],
  // ЗАДУМАЛИСЬ — вторая передышка
  [56, 'e-face', 'mono flash push'], [58, 's-moon', 'mono push'],
  // ЗАБЫЛИСЬ — финальный залп
  [60, 's-couple', 'zoom flash'], [61, 'e-eye', ''], [61.5, 'p-face', 'red'], [62, 's-wide', 'mono'],
  [62.5, '', 'black'], [63, 'e-eye', 'invert flash'], [63.5, '', 'black']
].map(([beat, framing, tags]) => ({time: beatTime(beat), framing: FRAMINGS[framing], tags: tags.split(' ')}));

// ===== Текст =====
// Время строк — из прошлой версии (на слух не перепроверено). Слова влетают по одному каждые step секунд.
const LINES = [
  {time: 0, rows: ['ДАЖЕ ЕСЛИ', 'ВЕСЬ МИР'], layout: 'left'},
  {time: 1.93, rows: ['ПРОТИВ', 'НАС.'], accent: 1},
  {time: 3.9, rows: ['Я БУДУ', 'РЯДОМ.'], accent: 1},
  {time: 7.8, rows: ['ТВОИ УЛЫБКИ', 'В ПАМЯТИ'], layout: 'low', outline: 1, step: BEAT},
  {time: 10, rows: ['ОСКОЛКИ', 'ГЛАЗ'], layout: 'right', accent: 1},
  {time: 12, rows: ['ПОСЛЕДСТВИЕ', 'ЯДА'], outline: 0},
  {time: 15.6, rows: ['У ПОДНОЖИЯ', 'ЛЕТА'], layout: 'left', accent: 1},
  {time: 17.55, rows: ['МЫ ЖДЁМ', 'ОТВЕТОВ'], outline: 1},
  {time: 19.5, rows: ['КОТОРЫХ', 'НЕТУ.'], accent: 1},
  {time: 23.4, rows: ['ПОТОРОПИЛИСЬ', 'БРОСИВ ВСЁ'], accent: 1},
  {time: 27.3, rows: ['ЗАДУМАЛИСЬ…'], step: BEAT},
  {time: 29.26, rows: ['ЗАБЫЛИСЬ…'], accent: 0}
];

// Индекс последнего элемента, который уже начался к моменту t.
function at(items, t) {
  let result = 0;
  for (let i = 1; i < items.length && items[i].time <= t; i++) result = i;
  return result;
}
function format(t) { return `00:${String(Math.floor(t || 0)).padStart(2, '0')}`; }

// ===== Элементы =====
const el = {
  screen: $('screen'), shake: $('shake'), camera: $('camera'), flash: $('flash'), shutter: $('shutter'),
  stage: $('typeStage'), lyrics: $('lyrics'), clock: $('clock'), seek: $('seek')
};
// Для RGB-сдвига заранее делаем две копии картинки: только красный канал и только голубой.
function channel(image, color) {
  const c = document.createElement('canvas');
  c.width = IMAGE_W; c.height = IMAGE_H;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0, IMAGE_W, IMAGE_H);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, IMAGE_W, IMAGE_H);
  return c;
}
// Картинки грузим один раз; как только загрузилась — перерисовываем текущий кадр.
const images = {};
['platform', 'eyes', 'summer'].forEach(name => {
  const image = new Image();
  image.onload = () => {
    images[name] = {full: image, red: channel(image, '#f00'), cyan: channel(image, '#0ff')};
    render(audio.currentTime);
  };
  image.src = `assets/${name}.webp`;
});
// Камера — канвас размером с экран (+12% запаса под тряску).
const view = el.camera.getContext('2d');

let lineIndex = -1;
let words = [];

function setLine(i) {
  lineIndex = i;
  const line = LINES[i];
  const step = line.step || BEAT / 2;
  el.stage.dataset.layout = line.layout || 'center';
  el.lyrics.setAttribute('aria-label', line.rows.join(' '));
  words = [];
  el.lyrics.replaceChildren(...line.rows.map((text, rowIndex) => {
    const row = document.createElement('span');
    row.className = 'lyric-row' + (line.accent === rowIndex ? ' accent' : '') + (line.outline === rowIndex ? ' outline' : '');
    row.setAttribute('aria-hidden', 'true');
    text.split(/\s+/).forEach(text => {
      const word = document.createElement('span');
      word.className = 'word';
      word.textContent = text;
      row.append(word);
      words.push({el: word, time: line.time + words.length * step});
    });
    return row;
  }));
  fitType();
}

// Уменьшаем шрифт, если самая длинная строка не влезает по ширине.
function fitType() {
  el.lyrics.style.fontSize = '';
  const size = parseFloat(getComputedStyle(el.lyrics).fontSize);
  const widest = Math.max(...Array.from(el.lyrics.children, row => row.scrollWidth));
  const available = el.lyrics.clientWidth * .97;
  if (widest > available) el.lyrics.style.fontSize = `${size * available / widest}px`;
}

// ===== Атмосфера: дождь и пылинки на канвасе =====
const canvas = $('atmosphere');
const ctx = canvas.getContext('2d');
function resize() {
  width = el.screen.clientWidth; height = el.screen.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Канвас камеры на 12% больше экрана, чтобы тряска не открывала края.
  const viewDpr = Math.min(devicePixelRatio || 1, 1.25);
  viewW = el.camera.width = Math.round(width * 1.12 * viewDpr);
  viewH = el.camera.height = Math.round(height * 1.12 * viewDpr);
  fitType(); render(audio.currentTime);
}
function atmosphere(t, summer) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!fx || !started) return;
  ctx.strokeStyle = 'rgba(210,216,243,.25)'; ctx.fillStyle = 'rgba(255,222,208,.6)'; ctx.lineWidth = .8;
  const count = width < 600 ? 24 : 45;
  for (let i = 0; i < count; i++) {
    const seed = (i * 137.508) % 997 / 997;
    const x = (seed * width + t * (summer ? 8 : -32) + width * 100) % width;
    const y = ((i * 79.71) % height + t * (summer ? -15 : 250) + height * 100) % height;
    if (summer) { ctx.globalAlpha = .3 + .4 * Math.sin(i + t) ** 2; ctx.fillRect(x, y, 1.5, 1.5); }
    else { ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 18); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

// Сила удара на доле: уровень такта, на первой доле такта сильнее.
function beatStrength(b) {
  if (b < 0 || b > 63) return 0;
  const level = LEVELS[Math.floor(b / 4)];
  return (.35 + level * .22) * (b % 4 === 0 ? 1.3 : 1);
}

// Рисуем кусок картинки на канвас камеры.
// split — на сколько пикселей разводим красный и голубой каналы, blur — смаз при резком входе.
function drawShot(image, crop, split, blur, flip) {
  view.globalCompositeOperation = 'source-over';
  view.fillStyle = '#000';
  view.fillRect(0, 0, viewW, viewH);
  if (!image) return;
  view.save();
  if (flip) { view.translate(viewW, 0); view.scale(-1, 1); }
  const draw = (source, dx) => view.drawImage(source, crop.x, crop.y, crop.w, crop.h, dx, 0, viewW, viewH);
  if (split < .5) {
    draw(image.full, 0);
  } else {
    // Красный канал + голубой канал (lighter = сложение) = обычная картинка, но со сдвигом.
    draw(image.red, split);
    view.globalCompositeOperation = 'lighter';
    draw(image.cyan, -split);
    view.globalCompositeOperation = 'source-over';
  }
  // Смаз: пара полупрозрачных копий со сдвигом.
  if (blur > 1) {
    view.globalAlpha = .35;
    draw(image.full, blur * 2);
    draw(image.full, -blur * 2);
    view.globalAlpha = 1;
  }
  view.restore();
}

// ===== Главный рендер кадра =====
function render(t = 0) {
  t = Number.isFinite(t) ? t : 0;
  const motion = fx && started;

  // --- кадр ---
  const si = at(SHOTS, t);
  const shot = SHOTS[si];
  const has = tag => shot.tags.includes(tag);
  const black = has('black') && motion;
  const framing = shot.framing || SHOTS[si - 1].framing;
  const age = t - shot.time;
  const duration = (SHOTS[si + 1]?.time || SONG_END) - shot.time;
  const u = clamp(age / duration);

  // Приближение: на вертикальном экране режем меньше, картинка и так обрезана.
  const portrait = width < height;
  let zoom = 1 + (framing[3] - 1) * (portrait ? .45 : 1);
  if (motion) zoom *= 1 + (has('push') ? .14 : .05) * easeOut(u);
  // Какой кусок картинки видно: точка фокуса по центру, но не вылезаем за края.
  const pixel = Math.max(viewW / IMAGE_W, viewH / IMAGE_H) * zoom;
  const cropW = viewW / pixel, cropH = viewH / pixel;
  const crop = {
    x: clamp(framing[1] / 100 * IMAGE_W - cropW / 2, 0, IMAGE_W - cropW),
    y: clamp(framing[2] / 100 * IMAGE_H - cropH / 2, 0, IMAGE_H - cropH),
    w: cropW, h: cropH
  };

  // --- удар по доле ---
  const beatPos = (t - OFFSET) / BEAT;
  const beatIndex = Math.floor(beatPos);
  const beatAge = (beatPos - beatIndex) * BEAT;
  let hit = motion ? beatStrength(beatIndex) * Math.exp(-beatAge * 13) : 0;
  // На уровне 3 добиваем ещё и полудоли.
  if (motion && LEVELS[Math.floor(beatIndex / 4)] === 3 && beatAge > BEAT / 2) hit += .45 * Math.exp(-(beatAge - BEAT / 2) * 16);

  const angle = hash(beatIndex) * Math.PI * 2;
  const wobble = Math.cos(beatAge * 55);
  let shakeX = Math.cos(angle) * 18 * hit * wobble;
  let shakeY = Math.sin(angle) * 12 * hit * wobble;
  const rotate = (hash(beatIndex + 7) - .5) * 3 * hit;
  let scale = 1 + .07 * hit;
  let blur = 0;

  // --- вход в кадр ---
  if (motion && has('whip')) {
    const k = 1 - easeOut(age / .14);
    const dir = hash(si) > .5 ? 1 : -1;
    shakeX += dir * 90 * k; scale *= 1 + .15 * k; blur = 14 * k;
  }
  if (motion && has('zoom')) scale *= 1 + .35 * (1 - easeOut(age / .16));
  el.shake.style.transform = `translate3d(${shakeX}px,${shakeY}px,0) rotate(${rotate}deg) scale(${scale})`;

  // --- RGB-сдвиг: красный и голубой каналы разъезжаются на ударе ---
  const split = motion ? 1.5 + 14 * hit + blur : 0;
  if (black) { view.fillStyle = '#000'; view.fillRect(0, 0, viewW, viewH); }
  else drawShot(images[framing[0]], crop, split, blur, has('flip'));
  const look = motion ? (shot.tags.map(tag => LOOKS[tag]).find(Boolean) || '') : '';
  el.camera.style.filter = look || 'none';

  // --- вспышка и финальное затемнение ---
  let flash = 0;
  if (motion && has('flash')) flash = .85 * Math.exp(-age * 16);
  if (motion && beatIndex % 4 === 0) flash = Math.max(flash, .18 * hit);
  el.flash.style.opacity = flash;
  el.shutter.style.opacity = clamp((t - 31) / .2);

  // --- текст ---
  const li = at(LINES, t);
  if (li !== lineIndex) setLine(li);
  const remaining = (LINES[li + 1]?.time || SONG_END) - t;
  words.forEach((word, n) => {
    if (!motion) { word.el.style.opacity = 1; word.el.style.transform = 'none'; return; }
    const a = t - word.time;
    const enter = easeOut(a / .13);
    let opacity = a < 0 ? 0 : clamp(a / .03);
    let x = 0;
    // Перед следующей строкой — глитч и исчезновение.
    if (remaining < .1) {
      const k = 1 - remaining / .1;
      x = (hash(n + beatIndex) - .5) * 60 * k;
      opacity *= 1 - k;
    }
    word.el.style.opacity = opacity;
    // Пока слово не появилось, держим обычный размер, чтобы оно не распирало строку.
    word.el.style.transform = `translate3d(${x}px,0,0) scale(${a < 0 ? 1 : 1.9 - .9 * enter})`;
  });
  const tilt = motion ? (hash(li + 3) - .5) * 6 : 0;
  const textSplit = motion ? 2 + 7 * hit : 0;
  el.lyrics.style.transform = `translate3d(${shakeX * .4}px,${shakeY * .4}px,0) rotate(${tilt}deg)`;
  el.lyrics.style.textShadow = motion
    ? `${textSplit}px 0 rgba(255,40,110,.75), ${-textSplit}px 0 rgba(40,220,255,.75), 0 3px 0 #08081466`
    : '';

  atmosphere(t, framing[0] === 'summer');
  el.clock.textContent = format(t);
  el.seek.value = t;
  el.seek.style.setProperty('--progress', `${clamp(t / (audio.duration || SONG_END)) * 100}%`);
  el.seek.setAttribute('aria-valuetext', `${Math.floor(t)} из ${Math.floor(audio.duration || 31)} секунд`);
}

// ===== Воспроизведение и управление =====
function tick() { raf = 0; render(audio.currentTime); if (!audio.paused && !audio.ended && !document.hidden) raf = requestAnimationFrame(tick); }
function requestTick() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }
function updatePlayback() {
  $('toggle').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('toggle').setAttribute('aria-label', audio.paused ? 'Воспроизвести' : 'Пауза');
}
async function play() {
  $('start').disabled = true;
  $('error').textContent = '';
  try {
    // play() вызываем прямо в обработчике клика — иначе iPhone Safari не даст включить звук.
    if (audio.ended) audio.currentTime = 0;
    await audio.play();
    started = true; el.screen.dataset.state = 'playing'; $('end').hidden = true;
    updatePlayback(); requestTick();
  } catch (error) {
    el.screen.dataset.state = 'intro';
    $('error').textContent = 'Не удалось включить трек. Нажми ещё раз или обнови страницу.';
  } finally { $('start').disabled = false; }
}
function replay() { audio.currentTime = 0; render(0); play(); }
function seekTo(t) {
  audio.currentTime = clamp(t, 0, Number.isFinite(audio.duration) ? audio.duration : SONG_END);
  if (started) { $('end').hidden = true; el.screen.dataset.state = audio.paused ? 'paused' : 'playing'; }
  render(audio.currentTime);
}
$('start').addEventListener('click', play);
$('toggle').addEventListener('click', () => audio.paused ? play() : audio.pause());
$('replay').addEventListener('click', replay);
$('endReplay').addEventListener('click', replay);
$('seek').addEventListener('input', e => seekTo(Number(e.target.value)));
$('mute').addEventListener('click', () => {
  audio.muted = !audio.muted;
  $('mute').textContent = `ЗВУК ${audio.muted ? 'OFF' : 'ON'}`;
  $('mute').setAttribute('aria-pressed', String(audio.muted));
  $('mute').setAttribute('aria-label', audio.muted ? 'Включить звук' : 'Выключить звук');
});
function updateFX() {
  $('effects').setAttribute('aria-pressed', String(fx));
  $('fxState').textContent = fx ? 'ON' : 'OFF';
  render(audio.currentTime);
}
$('effects').addEventListener('click', () => { fx = reducedMotion.matches ? false : !fx; updateFX(); });
reducedMotion.addEventListener('change', e => { fx = !e.matches; updateFX(); });
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await el.screen.requestFullscreen(); } catch {}
});
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) { el.seek.max = audio.duration; $('duration').textContent = format(audio.duration); }
});
audio.addEventListener('play', () => { updatePlayback(); requestTick(); });
audio.addEventListener('pause', () => {
  if (raf) cancelAnimationFrame(raf); raf = 0;
  if (started && !audio.ended) el.screen.dataset.state = 'paused';
  updatePlayback(); render(audio.currentTime);
});
audio.addEventListener('seeked', () => { render(audio.currentTime); requestTick(); });
audio.addEventListener('ended', () => { el.screen.dataset.state = 'ended'; $('end').hidden = false; updatePlayback(); render(audio.duration); });
audio.addEventListener('error', () => { el.screen.dataset.state = 'intro'; $('error').textContent = 'Трек не загрузился. Проверь соединение и попробуй ещё раз.'; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (started) audio.pause(); if (raf) cancelAnimationFrame(raf); raf = 0; }
  else render(audio.currentTime);
});
document.addEventListener('keydown', e => {
  if (e.target.closest('button,input,a')) return;
  if (e.code === 'Space') { e.preventDefault(); audio.paused ? play() : audio.pause(); }
  if (e.code === 'ArrowRight' && started) { e.preventDefault(); seekTo(audio.currentTime + 5); }
  if (e.code === 'ArrowLeft' && started) { e.preventDefault(); seekTo(audio.currentTime - 5); }
});
window.addEventListener('resize', resize);
setLine(0); resize(); updateFX();
