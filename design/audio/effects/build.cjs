/* Reproducible original SFX render + portable audition board. Requires Node and ffmpeg. */
/* global __dirname */
const {Buffer}=require('node:buffer');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const catalog=require('./catalog.cjs');
const scenes=require('./scenes.cjs');
const dsp=require('./synthesize.cjs');
const root=__dirname;
const boardOnly=process.argv.includes('--board-only');
const previous=boardOnly?JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')):null;
const previousChecks=boardOnly?JSON.parse(fs.readFileSync(path.join(root,'audio-checks.json'),'utf8')).checks:[];
const write=(name,data)=>fs.writeFileSync(path.join(root,name),data);
for(const dir of ['audio/wav','audio/mp3'])fs.mkdirSync(path.join(root,dir),{recursive:true});
const assets={};
const checks=[];
const hashes=new Set();
let count=0;
function render(id,samples,peakDb) {
  if(boardOnly){assets[id]=previous.assets[id];const check=previousChecks.find(c=>c.id===id);if(!assets[id]||!check)throw Error(`Missing prior render: ${id}`);checks.push(check);hashes.add(check.sha256);count++;return;}
  const {samples:finished,stats}=dsp.finish(samples,peakDb);
  if(!Number.isFinite(stats.rmsDb)||stats.rmsDb < -70||finished.some(x=>!Number.isFinite(x)||Math.abs(x)>=1))throw Error(`Bad render: ${id}`);
  if(stats.first!==0||stats.last!==0)throw Error(`Unfaded edge: ${id}`);
  const bytes=dsp.wav(finished),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hashes.has(hash))throw Error(`Duplicate render: ${id}`);
  hashes.add(hash);
  const wav=`audio/wav/${id}.wav`,mp3=`audio/mp3/${id}.mp3`;
  write(wav,bytes);
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(root,wav),'-codec:a','libmp3lame','-b:a','128k',path.join(root,mp3)],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(`ffmpeg: ${result.error||result.stderr}`);
  assets[id]={duration:stats.seconds,wav,mp3};
  checks.push({id,...stats,sha256:hash});
  if(++count%30===0)console.log(`Rendered ${count} sounds`);
}
for(const cue of catalog.cues)for(let i=0;i<cue.variants;i++)render(`${cue.id}-${i+1}`,dsp.effect(cue.recipe,i),cue.peak);
for(const c of catalog.characters)for(const emotion of catalog.emotions)render(`voice-${c.id}-${emotion.id}`,dsp.voice(c,emotion.id),{hello:-14,joy:-12,worry:-16,fall:-13,land:-15,recover:-17}[emotion.id]);
for(const scene of scenes)for(const event of scene.events) {
  if(event.id.startsWith('@')) {if(!catalog.emotions.some(e=>e.id===event.id.slice(1)))throw Error(`Bad voice in ${scene.id}`);}
  else if(!catalog.cues.some(c=>c.id===event.id))throw Error(`Bad cue in ${scene.id}`);
}
const manifest={version:1,title:'Hanged sound playground',sampleRate:dsp.SR,channels:1,format:'16-bit PCM WAV masters; 128 kbps MP3 previews',...catalog,scenes,assets};
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
write('audio-checks.json',JSON.stringify({rendered:count,unique:hashes.size,finite:true,nonSilent:true,fadedEdges:true,checks},null,2)+'\n');
const audio={};
for(const [id,a]of Object.entries(assets))audio[id]=fs.readFileSync(path.join(root,a.mp3)).toString('base64');
const music=[
  {id:'music-detours',name:'Little Detours',file:'01-little-detours.mp3'},
  {id:'music-window',name:'Sunday Window',file:'02-sunday-window.mp3'},
  {id:'music-updraft',name:'Updraft',file:'03-updraft.mp3'},
];
for(const m of music)audio[m.id]=fs.readFileSync(path.resolve(root,'../first-listen',m.file)).toString('base64');
const escapeJson=obj=>JSON.stringify(obj).replace(/</g,'\\u003c');
const substitutions={
  '__MANIFEST__':escapeJson({...manifest,music}),
  '__AUDIO__':escapeJson(audio),
  '/*__RIG__*/':fs.readFileSync(path.resolve(root,'../../characters/rig.js'),'utf8'),
  '/*__BALLOONS__*/':fs.readFileSync(path.resolve(root,'../../characters/balloons.js'),'utf8'),
};
let html=fs.readFileSync(path.join(root,'soundboard.template.html'),'utf8');
for(const [key,value]of Object.entries(substitutions))html=html.replace(key,()=>value);
write('soundboard.html',html);
console.log(`Complete: ${catalog.cues.length} effect families / ${count} audio files / ${scenes.length} scenes. HTML ${(Buffer.byteLength(html)/1048576).toFixed(1)} MB.`);
