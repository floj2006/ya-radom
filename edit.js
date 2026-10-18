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
const easeOutExpo = n => (n = clamp(n), n === 1 ? 1 : 1 - Math.pow(2, -10 * n));
const easeInOut = n => (n = clamp(n), n < .5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2);
// Детерминированный «рандом»: одно и то же число для одного и того же n.
const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

const SONG_END = 31.22;
// Сетка долей трека: 123 BPM, первая доля на 0.025 с. Нужна только для лёгкого пульса на начале такта.
const BAR = 4 * 60 / 123;
const OFFSET = 0.025;

// ===== Текст =====
// Время каждого слова снято с отделённого вокала (распознавание речи с таймкодами).
// words — время начала каждого слова по порядку, key — номер строки, где лежит главное слово.
const LINES = [
  {rows: ['ДАЖЕ ЕСЛИ', 'ВЕСЬ МИР'], words: [0.45, 1.36, 1.84, 2.08], layout: 'left'},
  {rows: ['ПРОТИВ', 'НАС.'], words: [2.68, 3.60], accent: 1},
  {rows: ['Я БУДУ', 'РЯДОМ.'], words: [4.72, 5.16, 5.84], accent: 1},
  {rows: ['ТВОИ УЛЫБКИ', 'В ПАМЯТИ'], words: [8.30, 9.06, 9.66, 9.78], layout: 'low', outline: 1},
  {rows: ['ОСКОЛКИ', 'ГЛАЗ'], words: [10.40, 11.32], layout: 'right', accent: 1},
  {rows: ['ПОСЛЕДСТВИЕ', 'ЯДА'], words: [12.30, 13.60], accent: 1},
  {rows: ['У ПОДНОЖИЯ', 'ЛЕТА'], words: [16.29, 16.70, 17.60], layout: 'left', accent: 1},
  {rows: ['МЫ ЖДЁМ', 'ОТВЕТОВ'], words: [18.08, 18.32, 19.02], outline: 1},
  {rows: ['КОТОРЫХ', 'НЕТУ.'], words: [20.30, 21.36], accent: 1},
  {rows: ['ПОТОРОПИЛИСЬ,', 'БРОСИВ ВСЁ'], words: [23.80, 26.12, 26.90], accent: 1},
  {rows: ['ЗАДУМАЛИСЬ…'], words: [28.00], layout: 'low'},
  {rows: ['ЗАБЫЛИСЬ…'], words: [29.34], accent: 0}
].map(line => ({...line, time: line.words[0] - .1}));

// Акценты: [время, сила]. На них камера толкается, каналы разъезжаются, иногда вспышка.
const ACCENTS = [
  [2.68, .4], [3.60, 1], [5.84, 1], [10.40, .5], [11.32, .9], [13.60, .9],
  [17.60, .5], [19.02, .4], [21.36, 1], [23.80, .6], [26.12, .5], [26.90, 1], [29.34, .5]
];

// ===== Кадры =====
// Картинка + точка фокуса (в % от картинки) + приближение.
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
  's-wide':    ['summer', 50, 50, 1],
  's-couple':  ['summer', 50, 72, 2.6],
  's-sun':     ['summer', 30, 60, 2.8],
  's-moon':    ['summer', 70, 13, 3.2],
  's-clouds':  ['summer', 45, 22, 1.8],
  's-grass':   ['summer', 25, 88, 2.2]
};
// Цветовые режимы кадра.
const LOOKS = {
  mono: 'grayscale(1) contrast(1.35) brightness(1.05)',
  red: 'grayscale(1) sepia(1) saturate(5) hue-rotate(-45deg) contrast(1.15)',
  dream: 'saturate(1.25) brightness(1.08) contrast(.95)'
};

// Монтаж: [секунда, кадр, теги]. Склейки стоят на словах.
// Вход: fade (из чёрного), dissolve (растворение), whip (рывок со смазом), flash (белая вспышка), без тега — прямая склейка.
// Движение: push (наезд), pull (отъезд), left/right (панорама). Цвет: mono, red, dream.
const SHOTS = [
  [0, 'p-wide', 'fade push'],
  [2.68, 'p-profile', 'left'],             // ПРОТИВ
  [3.60, 'p-face', 'flash push'],          // НАС
  [4.72, 's-wide', 'dissolve pull dream'], // Я БУДУ
  [5.84, 's-couple', 'push dream'],        // РЯДОМ
  [7.20, 's-sun', 'dissolve right dream'],
  [8.30, 'e-wide', 'dissolve push'],       // ТВОИ
  [9.06, 'e-face', 'left'],                // УЛЫБКИ
  [9.66, 's-clouds', 'dissolve mono push'],// В ПАМЯТИ
  [10.40, 'e-eye', 'whip push'],           // ОСКОЛКИ
  [11.32, 'e-eye', 'flash red pull'],      // ГЛАЗ
  [12.30, 'p-lights', 'mono right'],       // ПОСЛЕДСТВИЕ
  [13.60, 'e-tear', 'flash red push'],     // ЯДА
  [14.70, 'e-lips', 'dissolve push'],
  [15.20, 'p-rails', 'dissolve left'],
  [16.29, 's-wide', 'flash pull dream'],   // У ПОДНОЖИЯ
  [17.60, 's-grass', 'right dream'],       // ЛЕТА
  [18.08, 's-couple', 'push'],             // МЫ ЖДЁМ
  [19.02, 's-moon', 'dissolve pull'],      // ОТВЕТОВ
  [20.30, 'p-profile', 'mono push'],       // КОТОРЫХ
  [21.36, 'p-face', 'flash mono push'],    // НЕТУ
  [22.40, 'p-sky', 'dissolve right'],
  [23.80, 'p-wide', 'whip push'],          // ПОТОРОПИЛИСЬ
  [25.00, 'p-signal', 'left red'],
  [26.12, 's-grass', 'whip right'],        // БРОСИВ
  [26.90, 's-wide', 'flash pull'],         // ВСЁ
  [28.00, 'e-face', 'dissolve mono push'], // ЗАДУМАЛИСЬ
  [29.34, 's-couple', 'dissolve push dream'] // ЗАБЫЛИСЬ
].map(([time, framing, tags]) => ({time, framing: FRAMINGS[framing], tags: tags.split(' ')}));

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
// Камера — канвас размером с экран (+12% запаса под толчки).
const view = el.camera.getContext('2d');

let lineIndex = -1;
let words = [];

function setLine(i) {
  lineIndex = i;
  const line = LINES[i];
  el.stage.dataset.layout = line.layout || 'center';
  el.lyrics.setAttribute('aria-label', line.rows.join(' '));
  words = [];
  el.lyrics.replaceChildren(...line.rows.map((text, rowIndex) => {
    const row = document.createElement('span');
    row.className = 'lyric-row' + (line.accent === rowIndex ? ' accent' : '') + (line.outline === rowIndex ? ' outline' : '');
    row.setAttribute('aria-hidden', 'true');
    text.split(/\s+/).forEach(text => {
      // .word — окно-маска, .word-inner — само слово, которое выезжает из-под маски.
      const word = document.createElement('span');
      word.className = 'word';
      const inner = document.createElement('span');
      inner.className = 'word-inner';
      inner.textContent = text;
      word.append(inner);
      row.append(word);
      words.push({el: word, inner, time: line.words[words.length], key: line.accent === rowIndex});
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
  // Канвас камеры на 12% больше экрана, чтобы толчки не открывали края.
  const viewDpr = Math.min(devicePixelRatio || 1, 1.25);
  viewW = el.camera.width = Math.round(width * 1.12 * viewDpr);
  viewH = el.camera.height = Math.round(height * 1.12 * viewDpr);
  fitType(); render(audio.currentTime);
}
function atmosphere(t, summer) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!fx || !started) return;
  ctx.strokeStyle = 'rgba(210,216,243,.22)'; ctx.fillStyle = 'rgba(255,222,208,.6)'; ctx.lineWidth = .8;
  const count = width < 600 ? 22 : 40;
  for (let i = 0; i < count; i++) {
    const seed = (i * 137.508) % 997 / 997;
    const x = (seed * width + t * (summer ? 8 : -24) + width * 100) % width;
    const y = ((i * 79.71) % height + t * (summer ? -12 : 180) + height * 100) % height;
    if (summer) { ctx.globalAlpha = .3 + .4 * Math.sin(i + t) ** 2; ctx.fillRect(x, y, 1.5, 1.5); }
    else { ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

// Какой кусок картинки видно в кадре i в момент t (с учётом движения камеры).
function shotView(i, t, motion) {
  const shot = SHOTS[i];
  const [name, focusX, focusY, baseZoom] = shot.framing;
  const has = tag => shot.tags.includes(tag);
  const duration = (SHOTS[i + 1]?.time || SONG_END) - shot.time;
  const e = motion ? easeInOut((t - shot.time) / duration) : .5;

  // На вертикальном экране режем меньше: картинка и так обрезана по бокам.
  let zoom = 1 + (baseZoom - 1) * (width < height ? .45 : 1);
  if (has('push')) zoom *= 1 + .1 * e;
  else if (has('pull')) zoom *= 1.12 - .1 * e;
  else zoom *= 1.03 + .03 * e;
  let x = focusX;
  if (has('left')) x += 8 * (.5 - e);
  if (has('right')) x -= 8 * (.5 - e);

  // Точка фокуса по центру, но не вылезаем за края картинки.
  const pixel = Math.max(viewW / IMAGE_W, viewH / IMAGE_H) * zoom;
  const w = viewW / pixel, h = viewH / pixel;
  return {
    image: images[name],
    x: clamp(x / 100 * IMAGE_W - w / 2, 0, IMAGE_W - w),
    y: clamp(focusY / 100 * IMAGE_H - h / 2, 0, IMAGE_H - h),
    w, h
  };
}

// Рисуем кусок картинки на канвас камеры.
// split — на сколько пикселей разводим красный и голубой каналы, smear — смаз при рывке.
function drawShot(v, split, smear, alpha) {
  if (!v.image) return;
  const draw = (source, dx) => view.drawImage(source, v.x, v.y, v.w, v.h, dx, 0, viewW, viewH);
  view.globalAlpha = alpha;
  if (split < .5 || alpha < 1) {
    draw(v.image.full, 0);
  } else {
    // Красный канал + голубой канал (lighter = сложение) = обычная картинка, но со сдвигом.
    draw(v.image.red, split);
    view.globalCompositeOperation = 'lighter';
    draw(v.image.cyan, -split);
    view.globalCompositeOperation = 'source-over';
  }
  if (smear > 1) {
    view.globalAlpha = .3 * alpha;
    draw(v.image.full, smear);
    draw(v.image.full, -smear);
  }
  view.globalAlpha = 1;
}

// Сила акцента в момент t: последний акцент затухает за ~0.4 с. Плюс лёгкий пульс на начале такта.
function accentAt(t) {
  let value = 0, age = 9, index = -1;
  ACCENTS.forEach(([time, strength], i) => {
    if (time <= t && t - time < age) { age = t - time; value = strength; index = i; }
  });
  const barAge = ((t - OFFSET) % BAR + BAR) % BAR;
  return {
    hit: value * Math.exp(-age * 7),
    age, index,
    pulse: t > OFFSET ? .25 * Math.exp(-barAge * 9) : 0
  };
}

// ===== Главный рендер кадра =====
function render(t = 0) {
  t = Number.isFinite(t) ? t : 0;
  const motion = fx && started;

  // --- кадр и переход ---
  const si = at(SHOTS, t);
  const shot = SHOTS[si];
  const has = tag => shot.tags.includes(tag);
  const age = t - shot.time;
  const current = shotView(si, t, motion);
  const accent = motion ? accentAt(t) : {hit: 0, age: 9, index: 0, pulse: 0};
  const hit = accent.hit;

  let smear = 0, alpha = 1;
  if (motion && has('whip')) {
    // Рывок: картинка влетает сбоку со смазом.
    const k = 1 - easeOutExpo(age / .35);
    const dir = hash(si) > .5 ? 1 : -1;
    current.x = clamp(current.x + dir * current.w * .18 * k, 0, IMAGE_W - current.w);
    smear = 40 * k;
  }
  if (motion && has('dissolve')) alpha = easeInOut(age / .45);

  view.fillStyle = '#000';
  view.fillRect(0, 0, viewW, viewH);
  // Во время растворения под новым кадром дорисовываем конец предыдущего.
  if (alpha < 1 && si > 0) drawShot(shotView(si - 1, t, motion), 0, 0, 1);
  const split = motion ? 1 + 12 * hit + smear * .3 : 0;
  drawShot(current, split, smear, alpha);
  const look = shot.tags.map(tag => LOOKS[tag]).find(Boolean);
  el.camera.style.filter = motion && look ? look : 'none';

  // --- толчок камеры на акценте: одно затухающее колебание, без постоянной тряски ---
  const dirAngle = hash(accent.index + 1) * Math.PI * 2;
  const swing = Math.sin(accent.age * 34) * hit;
  const shakeX = Math.cos(dirAngle) * 9 * swing;
  const shakeY = Math.sin(dirAngle) * 6 * swing;
  const scale = 1 + .045 * hit + .008 * accent.pulse;
  el.shake.style.transform = `translate3d(${shakeX}px,${shakeY}px,0) scale(${scale})`;

  // --- свет: вспышка на входе, мягкое появление из чёрного, затемнение в конце ---
  let flash = 0;
  if (motion && has('flash')) flash = .5 * Math.exp(-age * 10);
  el.flash.style.opacity = flash;
  let shutter = clamp((t - 30.3) / .85);
  if (motion && has('fade')) shutter = Math.max(shutter, 1 - easeOut(age / 1.2));
  el.shutter.style.opacity = shutter;

  // --- текст ---
  const li = at(LINES, t);
  if (li !== lineIndex) setLine(li);
  const line = LINES[li];
  const lineEnd = LINES[li + 1]?.time || SONG_END;
  words.forEach((word, n) => {
    if (!motion) { word.el.style.opacity = 1; word.el.style.transform = 'none'; word.inner.style.transform = 'none'; return; }
    // Слово начинает выезжать чуть раньше, чем звучит, — так глаз воспринимает его «в такт».
    const a = t - (word.time - .06);
    const enter = easeOutExpo(a / .55);
    // Уход: слова по очереди уезжают вверх под маску.
    // Если последнее слово прозвучало совсем недавно, уход не играем — его не успеют прочитать.
    const leaveTime = lineEnd - line.words[line.words.length - 1] > .8 ? .26 : 0;
    const leave = leaveTime ? easeInOut((t - (lineEnd - .32 + n * .035)) / leaveTime) : 0;
    const y = (1 - enter) * 110 - leave * 110;
    word.el.style.opacity = a < 0 ? 0 : 1;
    word.inner.style.transform = `translate3d(0,${y}%,0) skewX(${(1 - enter) * -8}deg)`;
    // Главное слово ещё и «вдыхает»: короткий рост и возврат.
    const pop = word.key && a >= 0 ? .14 * Math.exp(-a * 6) * Math.sin(Math.min(a * 9, Math.PI)) : 0;
    word.el.style.transform = pop ? `scale(${1 + pop})` : 'none';
  });
  // Вся строка медленно плывёт, пока держится нота.
  const drift = motion ? easeInOut((t - line.time) / (lineEnd - line.time)) : 0;
  el.lyrics.style.transform = `translate3d(${shakeX * .35}px,${shakeY * .35 - drift * 10}px,0) scale(${1 + drift * .035})`;
  const textSplit = 6 * hit;
  el.lyrics.style.textShadow = motion && textSplit > .3
    ? `${textSplit}px 0 rgba(255,40,110,.7), ${-textSplit}px 0 rgba(40,220,255,.7)`
    : '';

  atmosphere(t, shot.framing[0] === 'summer');
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
