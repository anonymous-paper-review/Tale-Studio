import sharp from 'sharp';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));mkdirSync(join(dir,'report-images'),{recursive:true});
const names=['18-eight','18-retry-complete','23-night-request','23-night-popup','27-two-queued','27-partial','27-lost-response','29-complete','29-incomplete','29-reloaded-dialogue'];
const out=[];
for(const name of names){const src=join(dir,name+'.png');const metadata=await sharp(src).metadata();const data=await sharp(src).webp({quality:88,effort:6}).toBuffer();writeFileSync(join(dir,'report-images',name+'.webp'),data);out.push({name,width:metadata.width,height:metadata.height,bytes:data.length,note:'Format compression only; original screenshot content and dimensions preserved.'});}
writeFileSync(join(dir,'report-image-manifest.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({images:out,totalBytes:out.reduce((n,x)=>n+x.bytes,0)}));
