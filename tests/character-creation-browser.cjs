'use strict';
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const frontend = path.resolve(__dirname, '../frontend/Data/MeridianUI/aetheriusui');
(async () => {
  const browser = await chromium.launch({headless: true, channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1920,height:1080}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(fs.readFileSync(path.join(frontend, 'chargen.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
    await page.addStyleTag({path:path.join(frontend, 'chargen.css')});
    await page.evaluate(() => { window.commands = []; window.aetheriusChargen = json => window.commands.push(JSON.parse(json)); });
    await page.addScriptTag({path:path.join(frontend, 'chargen-visuals.js')});
    await page.addScriptTag({path:path.join(frontend, 'chargen.js')});
    const snapshot = {type:'snapshot', races:[{index:0,name:'Nórdico',description:'Descrição',selected:true}], categories:[{index:1,name:'Corpo',flag:2}], sliders:[{index:0,name:'Peso',flag:2,isSex:false,min:0,max:1,step:0.1,value:0.5}], name:'José',sex:'male'};
    await page.evaluate(encoded => window.dispatchEvent(new CustomEvent('aetherius-chargen-state',{detail:encoded})),Buffer.from(JSON.stringify(snapshot)).toString('base64'));
    assert.equal(await page.locator('#mc-name').inputValue(),'José');
    assert.equal(await page.locator('[data-race]').count(),1);
    for (const selector of ['#mc-name','[data-race]','[data-sex=male]','#mc-finish','#mc-setting-0']) assert.equal(await page.locator(selector).isDisabled(),true,selector);
    await page.locator('#mc-return-native').click();
    assert.deepEqual(await page.evaluate(() => window.commands.map(x=>x.type)),['snapshot','returnToVanilla']);
    assert.deepEqual(errors,[]);

    await page.setContent('<main id="catalog"></main>');
    await page.evaluate(() => {window.AetheriusUI = {registerModule: module => window.characterModule = module};});
    await page.addScriptTag({path:path.join(frontend,'modules/character/race-catalog.js')});
    await page.addScriptTag({path:path.join(frontend,'modules/character/character-module.js')});
    await page.addStyleTag({path:path.join(frontend,'modules/character/character-module.css')});
    const catalog = require('../character-creation/catalog.json');
    await page.evaluate(async catalog => {
      window.catalogController = new AbortController();
      window.requestCalls = [];
      window.cleanup = await window.characterModule.mount(document.getElementById('catalog'),{
        signal:window.catalogController.signal,
        request:async (...args)=>{window.requestCalls.push(args);return {payload:{schemaVersion:1,readOnly:true,races:catalog.races}};}
      });
    },catalog);
    assert.equal(await page.locator('.character-race-grid button').count(),10);
    assert.equal(await page.locator('.character-race-grid svg').count(),10);
    await page.locator('.character-race-grid button').nth(9).click();
    assert.equal(await page.locator('article h3').textContent(),catalog.races[9].name);
    assert.deepEqual(await page.evaluate(()=>window.requestCalls),[['character','snapshot',{}]]);
    await page.evaluate(()=>{window.catalogController.abort();window.cleanup.unmount();});
    assert.equal(await page.locator('#catalog').textContent(),'');
    assert.deepEqual(errors,[]);
    console.log('Browser QA passed: native read-only controls/UTF-8, ten icons, authenticated read-only catalog and teardown.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
