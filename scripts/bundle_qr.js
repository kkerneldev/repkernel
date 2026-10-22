// Bundles the MIT-licensed QRCode (Kazuhiko Arase) modules into one browser file exposing window.makeQR(text) -> {size, get(r,c)}
const fs = require("fs"), path = require("path");
const dir = process.argv[2], out = process.argv[3];
const names = ["QR8bitByte","QRMode","QRErrorCorrectLevel","QRMaskPattern","QRMath","QRPolynomial","QRRSBlock","QRBitBuffer","QRUtil","index"];
let code = "/* QRCode generator (c) 2009 Kazuhiko Arase, MIT license. http://www.d-project.com/ */\n(function(){\nvar defs={},cache={};\nfunction req(n){n=n.replace(/^\\.\\//,'').replace(/\\.js$/,'');if(cache[n])return cache[n].exports;var m=cache[n]={exports:{}};defs[n](m,m.exports,req);return m.exports;}\n";
for (const n of names) code += `defs[${JSON.stringify(n)}]=function(module,exports,require){\n${fs.readFileSync(path.join(dir, n + ".js"), "utf8")}\n};\n`;
code += `var QRCode=req("index");
window.makeQR=function(text){
  for(var type=2;type<=40;type++){
    try{var q=new QRCode(type,1);q.addData(text);q.make();
      return{size:q.getModuleCount(),get:function(r,c){return q.isDark(r,c);}};
    }catch(e){if(type===40)throw e;}
  }
};
})();\n`;
fs.writeFileSync(out, code);
