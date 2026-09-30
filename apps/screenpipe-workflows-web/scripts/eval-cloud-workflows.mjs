// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
// Browser-mock fixtures only. Next.js development chrome is hidden in captures.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base = process.env.CLOUD_WORKFLOWS_URL || 'http://127.0.0.1:1420';
const out = process.env.CLOUD_WORKFLOWS_SCREENSHOTS || '/tmp/screenpipe-cloud-workflows';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
const page=await browser.newPage({viewport:{width:1440,height:960}}); page.on('pageerror',e=>console.log('PAGE ERROR',e.message)); page.on('console',msg=>{if(msg.type()==='error') console.log('CONSOLE',msg.text().slice(0,1600));});
await page.goto(base+'/settings?section=display',{timeout:60000});
await page.getByRole('button',{name:'Do later',exact:true}).click({timeout:2000}).catch(()=>{});
await page.locator('label').filter({has:page.getByLabel('Light',{exact:true})}).click();
await page.getByRole('button',{name:'Back to app'}).click();
await page.getByRole('button',{name:'Do later',exact:true}).click({timeout:5000}).catch(()=>{});
await page.getByRole('button',{name:'Switch workspace',exact:true}).click();
await page.getByRole('menuitemradio',{name:/Workflows/}).click();
await page.getByRole('combobox',{name:'Workflow source'}).selectOption('cloud');
async function visit(extra='') {
 await page.evaluate(extra=>history.replaceState(null,'','/home?mode=workflows&workflowSource=cloud'+extra),extra);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
}
await page.getByRole('heading',{name:'Your cloud workflows',exact:true}).waitFor();
await page.getByText('Local workflow analysis is off',{exact:true}).waitFor();
assert((await page.locator('html').getAttribute('class')).includes('light'));
await page.screenshot({style:'nextjs-portal { display: none; }',path:out+'/after.png'});
await page.getByRole('button',{name:/Research synthesis/}).click();
await page.getByRole('heading',{name:'Collect sources',exact:true}).waitFor();
await page.screenshot({style:'nextjs-portal { display: none; }',path:out+'/cloud-detail.png'});
await page.getByRole('button',{name:'All workflows',exact:true}).click();
await page.getByRole('textbox',{name:'Search cloud workflows'}).fill('zzzz');
await page.getByRole('heading',{name:'No matching workflows'}).waitFor();
await page.getByRole('textbox',{name:'Search cloud workflows'}).fill('');
await page.getByRole('combobox',{name:'Workflow source'}).selectOption('device');
await page.getByRole('heading',{name:'Research synthesis',exact:true}).waitFor();
assert.equal(await page.getByRole('switch',{name:'Automatic updates'}).getAttribute('aria-checked'),'false');
await page.getByRole('combobox',{name:'Workflow source'}).selectOption('cloud');
await page.getByRole('heading',{name:'Your cloud workflows'}).waitFor();
await page.setViewportSize({width:800,height:850});await page.screenshot({style:'nextjs-portal { display: none; }',path:out+'/cloud-compact.png'});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
await page.setViewportSize({width:1440,height:960});
await visit('&cloudWorkflowState=empty');await page.getByRole('heading',{name:'No cloud workflows yet'}).waitFor();await page.screenshot({style:'nextjs-portal { display: none; }',path:out+'/cloud-empty.png'});
await visit('&cloudWorkflowState=error');await page.getByRole('heading',{name:'Cloud workflows unavailable'}).waitFor();await page.screenshot({style:'nextjs-portal { display: none; }',path:out+'/cloud-access.png'});
console.log('PASS: cloud list/detail/search, cloud/device switch, local tasks stay off, compact layout, empty/access states');
} finally {await browser.close();}
