const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const html = fs.readFileSync(require("node:path").join(__dirname, "../index.html"), "utf8");
const code = html.slice(html.indexOf("const DOWNLOAD_INTERVAL"), html.indexOf("async function loadNews()"));
let now = 1000000, calls = [], current = 17, mode = "ok";
const apps = [
 {id:"new",ipa:"https://github.com/owner/repo/releases/download/new/same.ipa"},
 {id:"old",ipa:"https://github.com/owner/repo/releases/download/old/same.ipa"},
 {id:"extra",ipa:"https://github.com/owner/repo/releases/download/new/extra.ipa"}
];
const rows = apps.map(a=>({dataset:{downloadRow:a.id},hidden:true}));
const values = apps.map(a=>({dataset:{downloadValue:a.id},textContent:""}));
const listeners = {}, storage = {};
let interval;
const context = vm.createContext({
 APPS:apps, lang:"en", URL, Intl, AbortController,
 Date:class extends Date {static now(){return now;}},
 document:{hidden:false,querySelectorAll:s=>s==="[data-download-row]"?rows:values,addEventListener:(name,fn)=>listeners[name]=fn},
 navigator:{onLine:true}, window:{addEventListener:(name,fn)=>listeners[name]=fn},
 sessionStorage:{getItem:key=>storage[key],setItem:(key,value)=>storage[key]=value},
 setInterval:(fn,ms)=>{interval={fn,ms};}, setTimeout:()=>0, clearTimeout:()=>{},
 fetch:async endpoint=>{
  calls.push(endpoint);
  if(mode==="network")throw Error("offline");
  const status=mode==="rate"?429:200;
  return {
   ok:status===200,status,
   headers:{get:key=>key==="Retry-After"?"300":null},
   json:async()=>{
    if(mode==="invalid")throw Error("bad json");
    if(mode==="missing")return {assets:[]};
    return {assets:[{name:"same.ipa",download_count:endpoint.includes("/new")?current:900},{name:"extra.ipa",download_count:0}]};
   }
  };
 }
});
vm.runInContext(code+";this.testAPI={loadDownloads,releaseFile};",context);
const api=context.testAPI;
(async()=>{
 assert.equal(interval.ms,120000);
 assert.equal(api.releaseFile("https://example.org/file.ipa"),null);
 assert.equal(api.releaseFile("https://github.com/o/r/releases/download/tag%2Fv1/My%20App.ipa").name,"My App.ipa");
 await api.loadDownloads();
 assert.deepEqual(apps.map(a=>a.downloads),[17,900,0]);
 assert.equal(calls.length,2,"one request for all files in the same release");
 assert.equal(rows[2].hidden,false,"zero downloads must be visible");
 assert.equal(values[2].textContent,"0");
 await api.loadDownloads();
 assert.equal(calls.length,2,"do not refetch before the interval");
 now+=120000;current=18;
 await interval.fn();
 assert.equal(apps[0].downloads,18,"polling updates counts");
 assert.equal(values[0].textContent,"18","update visible number in place");
 context.document.hidden=true;now+=120000;
 const prior=calls.length;await interval.fn();assert.equal(calls.length,prior);
 context.document.hidden=false;context.navigator.onLine=false;
 await interval.fn();assert.equal(calls.length,prior);
 context.navigator.onLine=true;
 listeners.visibilitychange();
 await new Promise(resolve => setImmediate(resolve));
 assert(calls.length>prior,"visible tab resumes polling");
 now+=120000;mode="invalid";
 await api.loadDownloads();assert.equal(apps[0].downloads,18);
 now+=120000;mode="network";
 await api.loadDownloads();assert.equal(apps[0].downloads,18);
 now+=120000;mode="rate";
 await api.loadDownloads();
 const rateCalls=calls.length;now+=120000;
 await api.loadDownloads();assert.equal(calls.length,rateCalls,"honor Retry-After");
 now+=180000;mode="missing";
 await api.loadDownloads();
 assert.equal(apps[0].downloads,null,"removed asset has no invented count");
 assert.equal(rows[0].hidden,true);
 console.log("PASS: exact release assets, grouping, zero counts, polling, tab visibility, offline, API failures, rate-limit backoff and deleted assets");
})().catch(error=>{console.error(error);process.exitCode=1;});
