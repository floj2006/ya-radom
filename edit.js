'use strict';
// All motion is sampled from audio.currentTime. No queued tweens or wall-clock timers.
const $ = id => document.getElementById(id);
const audio = $('audio');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let fx = !reducedMotion.matches;
let started = false;
let cueIndex = -1;
let shotIndex = -1;
let words = [];
let raf = 0;
let width = innerWidth, height = innerHeight;
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const easeOut = n => 1 - Math.pow(1 - clamp(n), 4);
const cues = [
  {time:0, rows:['ДАЖЕ ЕСЛИ','ВЕСЬ МИР'], label:'01 — ПРОТИВ МИРА', sub:'EVEN IF THE WORLD', layout:'left'},
  {time:1.93, rows:['ПРОТИВ','НАС.'], label:'01 — ПРОТИВ МИРА', sub:'IT’S YOU AND ME', layout:'center', accent:1},
  {time:3.9, rows:['Я БУДУ','РЯДОМ.'], label:'02 — ОБЕЩАНИЕ', sub:'I WILL STAY', layout:'center', accent:1},
  {time:7.8, rows:['ТВОИ УЛЫБКИ','В ПАМЯТИ'], label:'03 — ВОСПОМИНАНИЕ', sub:'STILL IN MY MIND', layout:'low', outline:1},
  {time:10, rows:['ОСКОЛКИ','ГЛАЗ'], label:'04 — ОСКОЛКИ', sub:'FRAGMENTS OF YOU', layout:'right', accent:1},
  {time:12, rows:['ПОСЛЕДСТВИЕ','ЯДА'], label:'05 — ПОСЛЕ ТЕБЯ', sub:'AFTER THE AFTERGLOW', layout:'small', outline:0},
  {time:15.6, rows:['У ПОДНОЖИЯ','ЛЕТА'], label:'06 — ПОСЛЕДНЕЕ ЛЕТО', sub:'THE SUMMER WE LEFT BEHIND', layout:'left', accent:1},
  {time:17.55, rows:['МЫ ЖДЁМ','ОТВЕТОВ'], label:'06 — ПОСЛЕДНЕЕ ЛЕТО', sub:'WAITING FOR AN ANSWER', layout:'center', outline:1},
  {time:19.5, rows:['КОТОРЫХ','НЕТУ.'], label:'07 — ТИШИНА', sub:'ONLY SILENCE', layout:'center', accent:1},
  {time:23.4, rows:['ПОТОРОПИЛИСЬ','БРОСИВ ВСЁ'], label:'08 — СЛИШКОМ РАНО', sub:'WE LEFT IT ALL', layout:'small', accent:1},
  {time:27.3, rows:['ЗАДУМАЛИСЬ…'], label:'09 — НЕ ЗАБЫВАЙ', sub:'DON’T FORGET', layout:'small'},
  {time:29.26, rows:['ЗАБЫЛИСЬ…'], label:'09 — НЕ ЗАБЫВАЙ', sub:'A MEMORY IN MOTION', layout:'small', outline:0}
];
// Existing repository's onset markers retained; editorial cuts have a separate shot list.
const beats = [1.93,3.88,5.83,7.8,9.73,12.42,13.65,15.6,17.55,18.53,19.5,20.97,23.41,25.36,27.31,29.26];
const shots = [
  [0,'platform',68,1.04,1.12,0], [1.93,'platform',82,1.3,1.19,-1],
  [3.9,'summer',50,1.14,1.03,1], [5.83,'summer',52,1.23,1.14,-1],
  [7.8,'eyes',37,1.04,1.1,0], [9.73,'eyes',33,1.24,1.15,1],
  [10.73,'platform',77,1.16,1.07,-1], [12.42,'eyes',41,1.12,1.2,0],
  [13.65,'platform',70,1.24,1.09,1], [15.6,'summer',50,1.02,1.1,-1],
  [17.55,'summer',53,1.2,1.13,1], [19.5,'platform',71,1.1,1.04,0],
  [20.97,'eyes',40,1.06,1.15,-1], [23.41,'platform',78,1.24,1.13,1],
  [24.4,'eyes',37,1.13,1.2,-1], [25.36,'summer',50,1.22,1.08,1],
  [26.35,'platform',72,1.18,1.1,-1], [27.31,'summer',50,1.1,1.02,0],
  [29.26,'platform',68,1.04,1.01,0]
];
function at(items, t, getTime = item => item.time) {
  let result = 0;
  for(let i=1;i<items.length && getTime(items[i])<=t;i++) result=i;
  return result;
}
function format(t){return `00:${String(Math.floor(t || 0)).padStart(2,'0')}`;}

const imageCache = ['platform','eyes','summer'].map(name => {
  const img = new Image(); img.src = `assets/${name}.webp`; return img;
});
function setCue(i){
  cueIndex=i;
  const cue=cues[i];
  $('typeStage').dataset.layout=cue.layout;
  $('caption').textContent=cue.label;
  $('subcaption').textContent=cue.sub;
  $('chapter').textContent=cue.label.replace(' — ',' / ');
  $('lyrics').setAttribute('aria-label',cue.rows.join(' '));
  words=[];
  $('lyrics').replaceChildren(...cue.rows.map((text,rowIndex)=>{
    const row=document.createElement('span');
    row.className='lyric-row'+(cue.accent===rowIndex?' accent':'')+(cue.outline===rowIndex?' outline':'');
    row.setAttribute('aria-hidden','true');
    text.split(/\s+/).forEach(text=>{
      const word=document.createElement('span');word.className='word';word.textContent=text;
      row.append(word);words.push(word);
    });
    return row;
  }));
  fitType();
}
function fitType(){
  const lyrics=$('lyrics');lyrics.style.fontSize='';
  const size=parseFloat(getComputedStyle(lyrics).fontSize);
  const widest=Math.max(...Array.from(lyrics.children,row=>row.scrollWidth));
  const available=lyrics.clientWidth*.97;
  if(widest>available)lyrics.style.fontSize=`${size*available/widest}px`;
}
const canvas=$('atmosphere');
const ctx=canvas.getContext('2d');
function resize(){
  width=$('screen').clientWidth;height=$('screen').clientHeight;
  const dpr=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
  fitType();render(audio.currentTime);
}
function atmosphere(t, summer){
  if(!ctx)return;
  ctx.clearRect(0,0,width,height);
  if(!fx || !started)return;
  ctx.strokeStyle='rgba(210,216,243,.2)';ctx.fillStyle='rgba(255,222,208,.5)';ctx.lineWidth=.7;
  const count=width<600?24:45;
  for(let i=0;i<count;i++){
    const seed=(i*137.508)%997/997;
    const x=(seed*width+t*(summer?8:-32)+width*100)%width;
    const y=((i*79.71)%height+t*(summer?-15:250)+height*100)%height;
    if(summer){ctx.globalAlpha=.3+.4*Math.sin(i+t)**2;ctx.fillRect(x,y,1.5,1.5);}
    else{ctx.globalAlpha=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+18);ctx.stroke();}
  }
  ctx.globalAlpha=1;
}
function render(t=0){
  t=Number.isFinite(t)?t:0;
  const i=at(cues,t);if(i!==cueIndex)setCue(i);
  const si=at(shots,t,s=>s[0]);const shot=shots[si];
  if(si!==shotIndex){
    shotIndex=si;
    for(const el of [$('frame'),$('echo')]){
      el.style.backgroundImage=`url("assets/${shot[1]}.webp")`;
      el.style.backgroundPosition=`${shot[2]}% 50%`;
      el.style.transformOrigin=`${shot[2]}% 50%`;
    }
  }
  const u=clamp((t-shot[0])/((shots[si+1]?.[0]||31.27)-shot[0]));
  const age=t-shot[0];
  let beatAge=10;
  for(const b of beats){if(b<=t)beatAge=t-b;else break;}
  const motion=fx&&started;
  const impact=motion?Math.exp(-beatAge*15):0;
  const cut=motion&&si>0?Math.pow(1-clamp(age/.36),3):0;
  const direction=shot[5];
  const zoom=motion?shot[3]+(shot[4]-shot[3])*easeOut(u)+impact*.035:1.04;
  const drift=motion?(u-.5)*direction*14:0;
  const shake=motion?Math.sin(beatAge*48)*impact*7:0;
  $('camera').style.transform=`translate3d(${drift+shake+cut*direction*25}px,${-shake*.4}px,0) rotate(${cut*direction*1.1}deg) scale(${zoom})`;
  $('echo').style.transform=`translate3d(${cut*direction*14}px,0,0)`;
  $('echo').style.opacity=cut*.22;
  $('flash').style.opacity=motion&&si>0?Math.max(0,1-age/.14)*.17:0;
  const fade=clamp((t-30.2)/1.05);
  $('shutter').style.opacity=fade*.92;
  const cueAge=t-cues[i].time;
  const remaining=(cues[i+1]?.time||31.27)-t;
  words.forEach((word,n)=>{
    const enter=motion?easeOut((cueAge-n*.065)/.42):1;
    const out=motion?clamp(remaining/.15):1;
    word.style.opacity=enter*out;
    // Deliberate slide/scale treatment, no tumbling letters or random center-word pulses.
    const side=i%3===0?-1:i%3===1?1:0;
    word.style.transform=`translate3d(${(1-enter)*side*34}px,${(1-enter)*24}px,0) scale(${1+(1-enter)*.12})`;
  });
  $('lyrics').style.transform=`scale(${1+impact*.012})`;
  $('typeStage').style.filter=motion&&cut>.1?`blur(${cut*2}px)`:'none';
  atmosphere(t,shot[1]==='summer');
  $('clock').textContent=format(t);
  $('seek').value=t;
  $('seek').style.setProperty('--progress',`${clamp(t/(audio.duration||31.27))*100}%`);
  $('seek').setAttribute('aria-valuetext',`${Math.floor(t)} из ${Math.floor(audio.duration||31)} секунд`);
}
function tick(){raf=0;render(audio.currentTime);if(!audio.paused&&!audio.ended&&!document.hidden)raf=requestAnimationFrame(tick);}
function requestTick(){if(!raf&&!document.hidden)raf=requestAnimationFrame(tick);}
function updatePlayback(){
  $('toggle').textContent=audio.paused?'▶':'Ⅱ';
  $('toggle').setAttribute('aria-label',audio.paused?'Воспроизвести':'Пауза');
}
async function play(){
  $('start').disabled=true;
  $('error').textContent='';
  try{
    // Call play directly within the user gesture: required by iPhone Safari.
    if(audio.ended)audio.currentTime=0;
    await audio.play();
    started=true;$('screen').dataset.state='playing';$('end').hidden=true;
    updatePlayback();requestTick();
  }catch(error){
    $('screen').dataset.state='intro';
    $('error').textContent='Не удалось включить трек. Нажми ещё раз или обнови страницу.';
  }finally{$('start').disabled=false;}
}
function replay(){audio.currentTime=0;render(0);play();}
function seekTo(t){
  audio.currentTime=clamp(t,0,Number.isFinite(audio.duration)?audio.duration:31.27);
  if(started){$('end').hidden=true;$('screen').dataset.state=audio.paused?'paused':'playing';}
  render(audio.currentTime);
}
$('start').addEventListener('click',play);
$('toggle').addEventListener('click',()=>audio.paused?play():audio.pause());
$('replay').addEventListener('click',replay);$('endReplay').addEventListener('click',replay);
$('seek').addEventListener('input',e=>seekTo(Number(e.target.value)));
$('mute').addEventListener('click',()=>{audio.muted=!audio.muted;$('mute').textContent=`ЗВУК ${audio.muted?'OFF':'ON'}`;$('mute').setAttribute('aria-pressed',String(audio.muted));$('mute').setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');});
function updateFX(){
  $('effects').setAttribute('aria-pressed',String(fx));$('fxState').textContent=fx?'ON':'OFF';
  render(audio.currentTime);
}
$('effects').addEventListener('click',()=>{fx=reducedMotion.matches?false:!fx;updateFX();});
reducedMotion.addEventListener('change',e=>{fx=!e.matches;updateFX();});
$('fullscreen').hidden=!document.fullscreenEnabled;
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();}catch{}});
audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(audio.duration)){$('seek').max=audio.duration;$('duration').textContent=format(audio.duration);}});
audio.addEventListener('play',()=>{updatePlayback();requestTick();});
audio.addEventListener('pause',()=>{if(raf)cancelAnimationFrame(raf);raf=0;if(started&&!audio.ended)$('screen').dataset.state='paused';updatePlayback();render(audio.currentTime);});
audio.addEventListener('seeked',()=>{render(audio.currentTime);requestTick();});
audio.addEventListener('ended',()=>{$('screen').dataset.state='ended';$('end').hidden=false;updatePlayback();render(audio.duration);});
audio.addEventListener('error',()=>{$('screen').dataset.state='intro';$('error').textContent='Трек не загрузился. Проверь соединение и попробуй ещё раз.';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(started)audio.pause();if(raf)cancelAnimationFrame(raf);raf=0;}else render(audio.currentTime);});
document.addEventListener('keydown',e=>{
  if(e.target.closest('button,input,a'))return;
  if(e.code==='Space'){e.preventDefault();audio.paused?play():audio.pause();}
  if(e.code==='ArrowRight'&&started){e.preventDefault();seekTo(audio.currentTime+5);}
  if(e.code==='ArrowLeft'&&started){e.preventDefault();seekTo(audio.currentTime-5);}
});
window.addEventListener('resize',resize);
setCue(0);resize();updateFX();
