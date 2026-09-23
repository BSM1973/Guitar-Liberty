const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..'),src=path.join(root,'node_modules','@coderline','alphatab','dist'),dir=path.join(root,'assets','vendor');
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(path.join(src,'alphaTab.min.js'),path.join(dir,'alphaTab.min.js'));
const fontSrc=path.join(src,'font'),fontDst=path.join(dir,'font');
fs.mkdirSync(fontDst,{recursive:true});
if(fs.existsSync(fontSrc))for(const f of fs.readdirSync(fontSrc))fs.copyFileSync(path.join(fontSrc,f),path.join(fontDst,f));
console.log('alphaTab runtime and notation fonts copied to assets/vendor');
