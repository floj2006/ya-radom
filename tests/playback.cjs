// Requires Playwright in the environment; no production dependency.
// Run: node tests/playback.cjs (optionally CHROMIUM_PATH=/path/to/chromium).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,req.url==='/'?'index.html':req.url);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    const data=fs.readFileSync(file);
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mp3':'audio/mpeg'};
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.setHeader('Accept-Ranges','bytes');
    const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
    if(match){const start=Number(match[1]),end=match[2]?Number(match[2]):data.length-1;res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${data.length}`);res.setHeader('Content-Length',end-start+1);res.end(data.subarray(start,end+1));}
    else{res.setHeader('Content-Length',data.length);res.end(data);}
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.click('#start');
    await page.waitForFunction(()=>document.querySelector('audio').currentTime>.1);
    await page.click('#toggle');
    await page.waitForFunction(()=>document.querySelector('#screen').dataset.state==='paused');
    assert.equal(await page.locator('#screen').getAttribute('data-state'),'paused');
    async function seek(t){
      await page.locator('#seek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input'));},t);
      await page.waitForFunction(t=>Math.abs(document.querySelector('audio').currentTime-t)<.03,t);
    }
    for(const [t,label] of [[4.6,'Я БУДУ РЯДОМ.'],[24,'ПОТОРОПИЛИСЬ БРОСИВ ВСЁ'],[2.4,'ПРОТИВ НАС.']]){
      await seek(t);assert.equal(await page.locator('#lyrics').getAttribute('aria-label'),label);
    }
    const state=()=>page.evaluate(()=>({camera:document.querySelector('#camera').style.transform,words:[...document.querySelectorAll('.word')].map(e=>e.style.cssText)}));
    await seek(4.12);const first=await state();await seek(17);await seek(4.12);assert.deepEqual(await state(),first,'seeking reconstructs animation');
    await page.waitForTimeout(160);assert.deepEqual(await state(),first,'pause freezes animation');
    for(const w of [320,390,1440]){
      await page.setViewportSize({width:w,height:w===1440?900:844});
      for(const t of [.7,2.4,4.6,8.6,10.6,12.8,16.3,18.2,20.1,24,27.8,29.8]){
        await seek(t);
        assert.equal(await page.locator('.lyric-row').evaluateAll(rows=>rows.every(r=>r.scrollWidth<=r.clientWidth+1)),true,`text overflow at ${w}px / ${t}s`);
      }
    }
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#effects').getAttribute('aria-pressed')==='false');await seek(4.12);
    assert.equal(await page.locator('#effects').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#flash').evaluate(el=>el.style.opacity),'0');
    assert.equal(await page.locator('.word').first().evaluate(el=>el.style.opacity),'1');
    await page.click('#mute');assert.equal(await page.locator('audio').evaluate(el=>el.muted),true);
    await seek(31.1);await page.click('#toggle');await page.waitForFunction(()=>document.querySelector('audio').ended);
    assert.equal(await page.locator('#end').isVisible(),true);
    await page.click('#endReplay');await page.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime<2&&document.querySelector('#end').hidden);
    assert.equal(await page.locator('#end').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: playback, pause, deterministic forward/backward seek, 12 cues at 320/390/1440px, reduced motion, mute, ending and replay.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
