const fs=require('fs');const path=require('path');
const src=path.join(__dirname,'..','node_modules','@coderline','alphatab','dist','alphaTab.min.js');
const dir=path.join(__dirname,'..','assets','vendor');const dst=path.join(dir,'alphaTab.min.js');
fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(src,dst);console.log('alphaTab runtime copied to assets/vendor');
