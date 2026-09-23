const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..'),src=path.join(root,'node_modules','@coderline','alphatab','dist'),dir=path.join(root,'assets','vendor');
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(path.join(src,'alphaTab.min.js'),path.join(dir,'alphaTab.min.js'));
for(const folder of ['font','soundfont']){
 const from=path.join(src,folder),to=path.join(dir,folder);fs.mkdirSync(to,{recursive:true});
 if(fs.existsSync(from))for(const f of fs.readdirSync(from)){const a=path.join(from,f),b=path.join(to,f);if(fs.statSync(a).isFile())fs.copyFileSync(a,b);}
}
console.log('alphaTab runtime, fonts and soundfont copied to assets/vendor');
