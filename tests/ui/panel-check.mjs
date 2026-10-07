import { spawn } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import pg from 'pg'
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
const root=process.cwd()
if(!process.env.TEST_DATABASE_URL)throw Error("Provide TEST_DATABASE_URL for an isolated, migrated test database")
const url=new URL(process.env.TEST_DATABASE_URL)
const db=new pg.Client({connectionString:url.href});await db.connect()
const suffix=randomUUID(), userId=`ui-check-${suffix}`, sourceId=randomUUID(), token=randomUUID()
const secret='local-ui-verification-secret-not-for-production-2026'
const origin=`https://ui-check-${suffix}.example.test`
let app,browser
const errors=[]
const productIds=[]
try {
  await db.query('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$2,$3,now(),now())',[userId,'UI verification',`${userId}@example.test`])
  await db.query('INSERT INTO session (id,user_id,token,expires_at,created_at,updated_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now(),now())',[randomUUID(),userId,token])
  await db.query('INSERT INTO catalog_sources (id,module_id,display_name,source_key,config,collection_enabled) VALUES ($1,$2,$3,$4,$5,false)',[sourceId,'shopify','UI header fixture',`${origin}/collections/sale`,JSON.stringify({catalogUrl:`${origin}/collections/sale`,robotsPolicy:'operator_approved',userAgent:'fixture-current-agent'})])
  await db.query('INSERT INTO source_origin_safety (origin,blocked_until,paused,throttle_strikes) VALUES ($1,NULL,false,0)',[origin])

  for(const [index,title] of ['Industrial contactor assembly','Panel mount circuit breaker','Compact motor controller'].entries()){
    const productId=randomUUID(),variantId=randomUUID(),listingId=randomUUID();productIds.push(productId)
    await db.query('INSERT INTO catalog_products (id,product_key,title,brand,product_type) VALUES ($1,$2,$3,$4,$5)',[productId,`panel-product-${suffix}-${index}`,title,'Fixture Industries','Electrical components'])
    await db.query('INSERT INTO catalog_variants (id,product_id,variant_key,sku) VALUES ($1,$2,$3,$4)',[variantId,productId,`panel-variant-${suffix}-${index}`,`DEMO-${index+1}`])
    await db.query('INSERT INTO source_listings (id,source_id,product_id,variant_id,listing_key,url) VALUES ($1,$2,$3,$4,$5,$6)',[listingId,sourceId,productId,variantId,`panel-listing-${suffix}-${index}`,`${origin}/products/fixture-${index}`])
    await db.query('INSERT INTO source_listing_current (listing_id,title,price,compare_at_price,currency,available,first_seen_at,last_seen_at,observed_at) VALUES ($1,$2,$3,$4,$5,true,now(),now(),now())',[listingId,title,[45,120,85][index],[90,240,160][index],'USD'])
  }

  app=spawn('node',['.output/server/index.mjs'],{cwd:root,env:{...process.env,PORT:'3397',HOST:'127.0.0.1',DATABASE_URL:url.href,BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:'http://127.0.0.1:3397',CATALOG_COLLECTION_ENABLED:'false',MEDIA_CAPTURE_ENABLED:'false'},stdio:['ignore','pipe','pipe']})
  let appErrors=''
  app.stdout.on('data',()=>{});app.stderr.on('data',chunk=>{appErrors+=chunk.toString().replaceAll(url.href,'[test database]')})
  for(let attempt=0;attempt<40;attempt++){
    try {if((await fetch('http://127.0.0.1:3397/api/ready')).ok)break}catch{}
    if(app.exitCode!==null)throw Error('Local verification app exited before readiness: '+appErrors.slice(-2000))
    if(attempt===39)throw Error('Local verification app did not become ready')
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  browser=await chromium.launch({channel:'chromium',chromiumSandbox:true})
  const context=await browser.newContext()
  const signature=createHmac('sha256',secret).update(token).digest('base64')
  await context.addCookies([{name:'better-auth.session_token',value:encodeURIComponent(`${token}.${signature}`),url:'http://127.0.0.1:3397',httpOnly:true,sameSite:'Lax'}])
  const page=await context.newPage();page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`))

  const label=process.env.PANEL_CAPTURE_LABEL||'verification'
  const {mkdir}=await import('node:fs/promises')
  await mkdir(`/tmp/hoardcore-panel-${label}`,{recursive:true})
  const results=[]
  await page.goto('http://127.0.0.1:3397/sources',{waitUntil:'networkidle'})
  await expect(page.getByText(/Network routing & request headers/)).toHaveCount(0)
  await page.getByRole('link',{name:'Configure source',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/settings/sources.*${sourceId}`))
  await page.getByText(/Network routing & request headers/).click()
  const routingSave=page.getByRole('button',{name:'Save routing & headers',exact:true})
  await routingSave.evaluate(node=>{node.dataset.fixtureIdentity='retained'})
  await page.getByLabel('User-Agent',{exact:true}).fill('panel-browser-fixture')
  await routingSave.click()
  await expect(page.getByText('Routing and catalog headers saved.',{exact:false})).toBeVisible()
  assert.equal(await routingSave.getAttribute('data-fixture-identity'),'retained','Routing editor must not remount after save')
  await page.getByLabel('Collection enabled',{exact:true}).check()
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByText('Collection settings and schedule saved.',{exact:true})).toBeVisible()
  await page.getByRole('link',{name:'Run & monitor',exact:true}).click()
  await expect(page.getByRole('button',{name:'Run in background',exact:true})).toBeEnabled()
  await page.getByRole('link',{name:'Configure source',exact:true}).click()
  await page.getByText(/Response safety/).first().click()
  const safetySave=page.getByRole('button',{name:'Save safety settings',exact:true})
  await safetySave.evaluate(node=>{node.dataset.fixtureIdentity='retained'})
  await page.getByLabel('Between scans (hours)',{exact:true}).fill('25')
  await safetySave.click()
  await expect(page.getByText('Safety settings saved',{exact:true})).toBeVisible()
  assert.equal(await safetySave.getAttribute('data-fixture-identity'),'retained','Response editor must not remount after save')
  for(const [route,name] of [['/','overview'],['/listings','listings'],['/sources','sources'],['/settings','settings'],['/settings/sources','source-settings'],['/settings/alerts','notifications'],['/settings/category-groups','categories'],['/settings/research-tokens','research-api'],['/settings/loxep','loxep'],['/research/manual','research'],['/opportunities','opportunities'],['/watchlist','watchlist']]){
    await page.setViewportSize({width:1440,height:1050})
    await page.goto('http://127.0.0.1:3397'+route,{waitUntil:'networkidle'})
    if(name==='research')await expect(page.getByRole('link',{name:'Research',exact:true})).toHaveAttribute('aria-current','location')
    if(route.startsWith('/settings')){
      const navigation=page.getByRole('navigation',{name:'Settings navigation'})
      await expect(navigation.getByRole('link')).toHaveCount(6)
      await expect(navigation.locator('[data-status="active"]')).toHaveCount(1)
    }
    await page.screenshot({path:`/tmp/hoardcore-panel-${label}/${name}-desktop.png`,fullPage:true})
    results.push({route,title:await page.title(),headings:await page.locator('h1,h2').allTextContents(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
    if(['listings','sources','settings','source-settings','notifications','categories','research-api','loxep'].includes(name)){
      await page.setViewportSize({width:390,height:844})
      await page.screenshot({path:`/tmp/hoardcore-panel-${label}/${name}-mobile.png`,fullPage:true})
      results.push({route,mobile:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
    }
  }
  await page.goto('http://127.0.0.1:3397/listings',{waitUntil:'networkidle'})
  await page.getByText('Advanced',{exact:true}).click()
  for(const width of [320,375,640,768]){
    await page.setViewportSize({width,height:900})
    results.push({route:'/listings',expanded:true,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
    await page.screenshot({path:`/tmp/hoardcore-panel-${label}/listings-expanded-${width}.png`,fullPage:true})
  }
  await page.goto('http://127.0.0.1:3397/settings/sources',{waitUntil:'networkidle'})
  await page.getByText(/Network routing & request headers/).click()
  await page.getByText(/Response safety/,{exact:false}).first().click()
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:`/tmp/hoardcore-panel-${label}/sources-expanded-mobile.png`,fullPage:true})
  results.push({route:'/sources',expanded:true,mobile:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)})
  await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.waitForFunction(()=>document.getAnimations().length===0)
  await page.screenshot({path:`/tmp/hoardcore-panel-${label}/sources-expanded-mobile-dark.png`,fullPage:true})
  await page.reload({waitUntil:'networkidle'})
  await page.getByText(/Network routing & request headers/).click()
  await expect(page.getByLabel('User-Agent',{exact:true})).toHaveValue('panel-browser-fixture')
  await page.getByRole('button',{name:'Sign out',exact:true}).click()
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
  await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()
  await expect(page.getByLabel('User-Agent',{exact:true})).toHaveCount(0)
  assert.equal(errors.length,0,`Browser runtime errors: ${errors.join('; ')}`)
  assert.ok(results.every(result=>!result.overflow),'Pages and expanded filters must fit within the viewport')
  console.log(JSON.stringify({label,results,browserErrors:errors}))

} finally {
  await browser?.close()
  if(app){app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(app.exitCode===null)app.kill('SIGKILL')}
  await db.query('DELETE FROM catalog_sources WHERE id=$1',[sourceId])
  for(const productId of productIds)await db.query('DELETE FROM catalog_products WHERE id=$1',[productId])
  await db.query('DELETE FROM source_origin_safety WHERE origin=$1',[origin])
  await db.query('DELETE FROM "user" WHERE id=$1',[userId])
  await db.end()
}
