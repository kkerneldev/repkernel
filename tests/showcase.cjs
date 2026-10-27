const {chromium} = require("playwright");
const http = require("node:http"), fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const mime = {".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpeg":"image/jpeg",".woff":"font/woff"};
const server = http.createServer(async(req,res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : decodeURIComponent(pathname)));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  try { const body = await fs.readFile(file);res.setHeader("Content-Type",mime[path.extname(file)] || "application/octet-stream");res.end(body); }
  catch {res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try {
  browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const base="http://127.0.0.1:"+server.address().port;
  const context=await browser.newContext({reducedMotion:"reduce"});
  await context.addInitScript(()=>{localStorage.setItem("preferred_sideload_client","altstore");localStorage.setItem("lang","ru");});
  await context.route("**/*",route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});
   await page.goto(base+"/");
   await page.waitForSelector(".card-preview");
   await page.locator("#apps").scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll(".card-preview img")].length===4 && [...document.querySelectorAll(".card-preview img")].every(img=>img.complete && img.naturalWidth>0));
   assert.equal(await page.locator(".card .app-icon img").count(),2);
   const overflow = await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(el=>{const r=el.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || r.left < -1)}).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})));
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) console.log("Overflow:", JSON.stringify(overflow));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), "Horizontal overflow at "+width);
   for(const theme of ["light","dark"]){
    await page.evaluate(theme=>{localStorage.setItem("theme",theme);applyTheme();},theme);
    await page.evaluate(()=>scrollTo(0,0));
    if(width===390||width===1440) {
     const screenshot=path.join(os.tmpdir(),"repkernel-"+width+"-"+theme+".png");
     await page.screenshot({path:screenshot,fullPage:true});
     console.log("Screenshot: "+screenshot);
    }
   }
   await page.locator(".card-preview").first().click();
   await page.waitForFunction(()=>!document.querySelector("#detailModal").classList.contains("hidden"));
   assert.equal(await page.locator("#detailBody .shots img").count(),2);
   await page.keyboard.press("Escape");
   await page.locator("#langBtn").click();
   await page.waitForFunction(()=>document.documentElement.lang==="en");
   await page.goto(base+"/app.html?id=org.ayugram.app");
   await page.waitForSelector(".ahead");
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log("PASS: "+width+"px, images, details, language, themes, standalone page");
  }
  assert.deepEqual(errors,[]);
  await context.close();
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
