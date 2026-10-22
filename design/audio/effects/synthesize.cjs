/* Original procedural sound design. No downloaded effects or actor recordings. */
const {Buffer}=require('node:buffer');
const SR = 48000;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
function random(seed) { let n=seed>>>0; return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}; }
function hash(text) { let h=2166136261; for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0; }
function buf(seconds) { return new Float32Array(Math.ceil(seconds*SR)); }
function mix(...layers) {
  const length=Math.max(...layers.map(([a,t])=>a.length+Math.round(t*SR)));
  const out=new Float32Array(length);
  for(const [a,t,gain=1] of layers) { const start=Math.round(t*SR);for(let i=0;i<a.length;i++)out[start+i]+=a[i]*gain; }
  return out;
}
function resonantNoise(duration, center, width, rng, decay=0, sweep=0) {
  const out=buf(duration), r=Math.exp(-Math.PI*width/SR), a2=-r*r;
  let y1=0,y2=0,a1=0;
  for(let i=0;i<out.length;i++) {
    const t=i/SR,p=t/duration;
    if(i%64===0)a1=2*r*Math.cos(TAU*(center+sweep*p)/SR);
    const y=(1-r)*(rng()*2-1)+a1*y1+a2*y2;y2=y1;y1=y;
    const env=decay?Math.min(1,t/.002)*Math.exp(-t/decay):Math.pow(Math.sin(Math.PI*p),1.4);
    out[i]=y*env;
  }
  return out;
}
function tone(duration,start,end,decay=0,style='round') {
  const out=buf(duration);let phase=0;
  for(let i=0;i<out.length;i++) {
    const t=i/SR,p=t/duration;
    const hz=end+(start-end)*Math.exp(-p*5);
    phase+=TAU*hz/SR;
    const source=Math.sin(phase)+(style==='round'?.16:.29)*Math.sin(2*phase)+.07*Math.sin(3*phase);
    out[i]=source*Math.min(1,t/.003)*(decay?Math.exp(-t/decay):Math.pow(Math.sin(Math.PI*p),1.2));
  }
  return out;
}
function modal(hz,duration,type='wood',rng=()=>.5) {
  const ratios=type==='coin'?[1,2.03,2.77,4.08,5.27,6.71]:type==='glass'?[1,2.01,3.98,5.43]:[1,2.76,5.40,8.93];
  const out=buf(duration);
  ratios.forEach((ratio,k)=>{
    const f=hz*ratio*(1+(rng()-.5)*.006),tau=duration/(3.6+k*1.8),gain=1/Math.pow(k+1,1.7);
    for(let i=0;i<out.length;i++) {const t=i/SR;out[i]+=Math.sin(TAU*f*t)*Math.exp(-t/tau)*Math.min(1,t/.0025)*gain;}
  });return out;
}
function swish(duration,rng,up=true,soft=false) {
  return mix([resonantNoise(duration,soft?600:1000,soft?1300:2100,rng,0,up?1600:-650),0,1],[resonantNoise(duration,350,400,rng,0,up?300:-180),0,.28]);
}
function tap(hz,rng,deep=false) {
  return mix([modal(hz,deep?.17:.10,'wood',rng),0,.65],[resonantNoise(.045,2100,2900,rng,.008),0,.3],[tone(.055,deep?160:260,deep?90:150,.013),0,.3]);
}
function sparkle(notes,spacing,rng,type='glass',duration=.40) {
  return mix(...notes.map((m,i)=>[modal(440*Math.pow(2,(m-69)/12),duration,type,rng),i*spacing,Math.pow(.90,i)]));
}
function rubber(duration,from,to,rng) {
  const out=buf(duration);let phase=0;
  for(let i=0;i<out.length;i++) {
    const t=i/SR,p=t/duration,f=lerp(from,to,p)+35*Math.sin(p*Math.PI*2.4);
    phase+=TAU*f/SR;out[i]=(Math.sin(phase)+.32*Math.sin(phase*2.01)+.12*Math.sin(phase*3))*Math.pow(Math.sin(Math.PI*p),1.6);
  }
  return mix([out,0,.7],[resonantNoise(duration,800,600,rng,0,400),0,.2]);
}
function pop(rng,large=false) {
  return mix([resonantNoise(.055,1800,3900,rng,.007),.001,.7],[tone(large?.22:.15,large?230:310,large?80:110,.038),0,.8],[rubber(.065,540,185,rng),.013,.25],[resonantNoise(.20,1200,2300,rng,.038),.016,.28]);
}
function paper(duration,rng) {
  const pieces=[];
  for(let i=0;i<7;i++)pieces.push([resonantNoise(.055+rng()*.055,1200+rng()*1800,1800,rng,.018),i*duration/9+rng()*.01,1-i*.08]);
  return mix(...pieces);
}

function effect(recipe,variant=0) {
  const rng=random(hash(recipe+variant)),j=.96+rng()*.08;
  const wood=(f,d=.18)=>modal(f*j,d,'wood',rng);
  const bell=(f,d=.35)=>modal(f*j,d,'coin',rng);
  const seq=(notes,spacing=.11,type='glass',d=.42)=>sparkle(notes,spacing,rng,type,d);
  switch(recipe) {
    case 'key': return tap(530*j,rng);
    case 'tap': return tap(660*j,rng);
    case 'primary': return mix([tap(390*j,rng,true),0,1],[wood(760,.10),.025,.19]);
    case 'correct': return mix([wood(740,.23),0,1],[wood(1110,.20),.035,.58],[tone(.12,380,370,.04),0,.15]);
    case 'wrong': return mix([wood(270,.16),0,1],[resonantNoise(.08,630,800,rng,.02),.01,.35]);
    case 'tile': return mix([tap(1050*j,rng),0,1],[wood(450,.07),.026,.30]);
    case 'deal': return mix([paper(.25,rng),0,.42],[wood(550,.15),.04,.5],[wood(680,.13),.12,.6],[wood(830,.17),.21,.7]);
    case 'letters': return mix([seq([74,81],.14,'wood',.32),0,1],[paper(.13,rng),0,.1]);
    case 'win': return mix([seq(variant?[74,78,81,86]:[74,78,83,81],.10,'wood',.65),0,.7],[seq([62,66,69],.018,'glass',.85),.22,.22]);
    case 'loss': return mix([seq(variant?[69,66,62]:[71,69,66],.18,'wood',.52),0,.7],[modal(293.66,.9,'glass',rng),.46,.22]);
    case 'stamp': return mix([tone(.16,175,83,.038),0,1],[resonantNoise(.12,820,2100,rng,.018),.004,.6],[wood(320,.12),.02,.35]);
    case 'stretch': return rubber(.144,210*j,390*j,rng);
    case 'last-stretch': return rubber(.352,190,450,rng);
    case 'pop': return pop(rng);
    case 'last-pop': return pop(rng,true);
    case 'string': return mix([rubber(.14,430*j,140*j,rng),0,.2],[paper(.16,rng),.04,.25]);
    case 'sink': return mix([rubber(.32,230*j,130*j,rng),0,.5],[swish(.30,rng,false,true),0,.16]);
    case 'fall': return swish(.484,rng,false);
    case 'impact': return mix([tone(.38,145*j,55*j,.07),0,1],[wood(290,.24),.008,.35],[resonantNoise(.23,600,1600,rng,.035),.004,.65],[rubber(.20,170,90,rng),.03,.16]);
    case 'bounce': return mix([tone(.20,210*j,100*j,.042),0,.7],[wood(400,.17),.008,.18],[resonantNoise(.10,530,800,rng,.018),0,.25]);
    case 'dust': return mix([paper(.40,rng),0,.30],[swish(.48,rng,false,true),0,.45]);
    case 'stars': return seq(variant?[86,90,85]:[85,90,86],.21,'glass',.27);
    case 'token-gain': return mix([bell(1380,.34),0,.6],[bell(2070,.25),.048,.4],[wood(500,.12),0,.2]);
    case 'token-spend': return mix([bell(1440,.24),0,.65],[bell(960,.24),.064,.75],[paper(.10,rng),0,.15]);
    case 'token-flight': return mix([swish(.62,rng,true,true),0,.65],[rubber(.45,330,650,rng),.08,.09]);
    case 'token-land': return mix([bell(1560,.39),0,.65],[bell(2340,.24),.022,.28],[wood(480,.13),0,.4]);
    case 'spend-land': return mix([bell(950,.22),0,.6],[wood(300,.16),.02,.5]);
    case 'count': return mix([bell(1250*j,.085),0,.45],[wood(790,.06),.004,.25]);
    case 'refused': return mix([wood(340,.16),0,.8],[wood(290,.19),.10,.65]);
    case 'streak-open': return mix([swish(.28,rng,true,true),0,.40],[seq([62,69],.08,'wood',.30),0,.30]);
    case 'streak-fill': return mix([rubber(.62,240,720,rng),0,.25],[swish(.62,rng,true,true),0,.45],[seq([66,69,74],.17,'glass',.13),.05,.12]);
    case 'star-land': return mix([bell(1760,.43),0,.45],[wood(620,.14),0,.6],[modal(1174,.30,'glass',rng),.06,.22]);
    case 'streak-bonus': return mix([seq([74,78,81,86],.09,'glass',.70),0,.6],[seq([62,66,69],.017,'wood',.80),.18,.4],[swish(.32,rng,true,true),0,.15]);
    case 'confetti': return mix([resonantNoise(.14,1300,2300,rng,.023),0,.55],[paper(.65,rng),.05,.32],[tone(.12,210,110,.035),0,.15]);
    case 'level-rise': return mix([swish(.95,rng,true,true),0,.4],[seq([62,66,69,74],.22,'wood',.18),.04,.28]);
    case 'level-slide': return mix([swish(1.15,rng,false,true),0,.45],[rubber(.68,340,160,rng),.12,.12]);
    case 'level-up': return mix([seq([62,69,74,78,81,86],.11,'wood',.65),0,.55],[seq([62,66,69],.018,'glass',.95),.45,.3]);
    case 'level-down': return mix([seq([69,66,62],.17,'wood',.45),0,.55],[wood(293.66,.6),.5,.24]);
    case 'map-open': return mix([paper(.32,rng),0,.36],[swish(.28,rng,true,true),0,.4],[wood(660,.16),.14,.18]);
    case 'map-close': return mix([paper(.22,rng),0,.3],[swish(.20,rng,false,true),0,.3]);
    case 'fog': return mix([swish(.70,rng,true,true),0,.65],[seq([81,86],.27,'glass',.4),.12,.055]);
    case 'summit': return mix([seq([62,66,69,74,78,81,86],.15,'wood',1),0,.45],[seq([62,66,69,74],.025,'glass',1.2),.80,.4],[seq([86,90],.15,'glass',.7),1.07,.13]);
    case 'crown': return mix([bell(1180,.50),0,.5],[bell(1770,.35),.032,.25],[wood(590,.14),0,.22]);
    case 'browse': return mix([swish(.18,rng,variant%2===0,true),0,.45],[tap(610*j,rng),.035,.28]);
    case 'choose': return mix([wood(620,.18),0,.6],[wood(930,.25),.07,.55]);
    case 'latch': return mix([tap(420*j,rng,true),0,.55],[bell(740,.19),.055,.3],[wood(1100,.15),.10,.22]);
    case 'unlock': return mix([seq([66,69,74,81],.11,'wood',.6),0,.55],[seq([62,66,69],.021,'glass',.85),.23,.3],[swish(.28,rng,true,true),0,.15]);
    case 'ribbon': return mix([paper(.20,rng),0,.5],[rubber(.18,290,420,rng),0,.09]);
    case 'tab': return mix([tap(690*j,rng),0,.6],[swish(.13,rng,true,true),0,.18]);
    case 'back': return mix([tap(470*j,rng),0,.4],[swish(.18,rng,false,true),0,.4]);
    case 'panel-open': return mix([swish(.23,rng,true,true),0,.4],[wood(730,.14),.08,.25]);
    case 'panel-close': return mix([swish(.17,rng,false,true),0,.4],[wood(480,.12),.09,.22]);
    case 'link': return mix([tap(850*j,rng),0,.5],[swish(.14,rng,true,true),.02,.25]);
    case 'edit': return mix([paper(.09,rng),0,.3],[wood(880,.13),.01,.45]);
    case 'dice': return mix(...[0,.047,.11,.19,.31].map((t,i)=>[tap((740-i*70)*j,rng),t,.6+i*.05]));
    case 'name-save': return seq([69,74,78],.085,'wood',.39);
    case 'name-invalid': return mix([wood(430,.14),0,.5],[wood(380,.14),.10,.35]);
    case 'delete-open': return mix([swish(.25,rng,false,true),0,.5],[wood(280,.25),.02,.18]);
    case 'delete-confirm': return mix([wood(330,.18),0,.5],[paper(.15,rng),.035,.3]);
    case 'delete-complete': return mix([paper(.38,rng),0,.5],[wood(460,.30),.18,.14]);
    case 'operation-failed': return mix([wood(390,.16),0,.5],[wood(310,.23),.13,.4]);
    case 'period': return mix([tap(710*j,rng),0,.5],[rubber(.10,420,560,rng),.015,.11]);
    case 'refresh': return mix([swish(.27,rng,true,true),0,.6],[wood(720,.15),.19,.30]);
    case 'board-ready': return seq([69,74],.08,'wood',.30);
    case 'offline': return mix([wood(420,.18),0,.5],[wood(350,.18),.12,.35]);
    default: throw new Error('Unknown recipe '+recipe);
  }
}

const vowels={u:[340,850,2200],o:[470,960,2450],a:[750,1240,2650],e:[500,1850,2700],i:[300,2240,3100],m:[260,1150,2400]};
function syllable(duration,profile,from,to,pitch,contour,rng) {
  const out=buf(duration), filters=[{y1:0,y2:0},{y1:0,y2:0},{y1:0,y2:0}];
  let phase=0,breathLP=0,low=0;
  for(let i=0;i<out.length;i++) {
    const t=i/SR,p=t/duration;
    const bend=contour[0]+(contour[1]-contour[0])*Math.sin(p*Math.PI/2)+(contour[2]||0)*Math.sin(p*Math.PI);
    const wobble=1+.012*Math.sin(TAU*5.4*t)+profile.rough*.035*Math.sin(TAU*43*t);
    const hz=profile.f0*pitch*Math.pow(2,bend/12)*wobble;
    phase=(phase+hz/SR)%1;
    // An asymmetric glottal pulse, with breath and species-specific roughness.
    let source=phase<.63?Math.pow(Math.sin(Math.PI*phase/.63),1.4):-.12*Math.sin(Math.PI*(phase-.63)/.37);
    source-=.30;
    source*=1-profile.rough*.5+profile.rough*.5*Math.sin(TAU*hz*.5*t);
    if(profile.pulse)source*=.82+.18*Math.sin(TAU*profile.pulse*t);
    const n=rng()*2-1;breathLP+=.16*(n-breathLP);
    source+=profile.air*(n-breathLP);
    let shaped=0;
    filters.forEach((f,k)=>{
      if(i%64===0) {
        const freq=lerp(vowels[from][k],vowels[to][k],p)*profile.scale;
        const bw=[95,140,220][k]*(1+profile.air*2),r=Math.exp(-Math.PI*bw/SR);
        f.a1=2*r*Math.cos(TAU*freq/SR);f.a2=-r*r;f.b=1-r;
      }
      const y=f.b*source+f.a1*f.y1+f.a2*f.y2;f.y2=f.y1;f.y1=y;shaped+=y*[1,.65,.30][k];
    });
    if(profile.shape==='water')shaped*=.80+.20*Math.sin(TAU*(10+12*p)*t);
    if(profile.shape==='owl')shaped=shaped*.65+Math.sin(TAU*hz*t)*.07;
    const env=Math.pow(Math.sin(Math.PI*p),.68)*Math.min(1,t/.014)*Math.min(1,(duration-t)/.028);
    const value=shaped+breathLP*profile.air*.14;
    low+=.42*(value-low);out[i]=low*env;
  }
  return out;
}
function voice(profile,emotion) {
  const rng=random(hash(profile.id+emotion)),pace=profile.pace;
  const patterns={
    hello:[[0,.20,'m','o',1,[0,3,1]],[.24,.27,'o','u',1.05,[4,0,2]]],
    joy:[[0,.14,'u','a',1.12,[2,7,1]],[.18,.17,'a','i',1.19,[4,9,0]],[.39,.28,'e','a',1.12,[7,3,2]]],
    worry:[[0,.18,'e','o',1.02,[4,-1,1]],[.22,.19,'u','m',.95,[1,-3,0]]],
    fall:[[0,.48,'u','a',1.12,[3,9,-1]]],
    land:[[0,.20,'a','u',.84,[1,-5,0]]],
    recover:[[0,.24,'m','u',.91,[-2,1,0]],[.31,.28,'u','e',1.0,[0,3,1]]],
  };
  const vowelsFor={cat:['i','a'],bunny:['m','e'],bear:['o','a'],puppy:['a','u'],penguin:['e','a'],panda:['m','u'],koala:['o','u'],water:['u','o'],raccoon:['e','i'],fox:['i','e'],owl:['u','u'],dino:['o','a'],bat:['i','u'],sprite:['m','o'],frog:['o','u']};
  const syllables=patterns[emotion].map(([start,duration,from,to,pitch,contour],i)=>{
    const pair=vowelsFor[profile.shape];
    const first=emotion==='land'?'a':i===0?pair[0]:from;
    const last=emotion==='fall'?'a':i===0?pair[1]:to;
    return [syllable(duration*pace,profile,first,last,pitch,contour,rng),start*pace,1];
  });
  if(profile.shape==='sprite'&&emotion==='hello')syllables.push([modal(620,.12,'wood',rng),.53*pace,.035]);
  if(profile.shape==='water')syllables.push([rubber(.10,380,170,rng),emotion==='land'?.02:.18,.015]);
  return mix(...syllables);
}

function finish(input,peakDb) {
  // Two tiny room reflections, followed by DC removal, fades and peak alignment.
  const out=mix([input,.004,1],[input,.017,.045],[input,.035,.023]);
  let mean=0;for(const x of out)mean+=x;mean/=out.length;
  let peak=0,squares=0;
  const fadeIn=Math.round(.002*SR),fadeOut=Math.round(.018*SR);
  for(let i=0;i<out.length;i++) {
    const edge=Math.min(1,i/fadeIn,(out.length-1-i)/fadeOut);
    out[i]=(out[i]-mean)*Math.max(0,edge);peak=Math.max(peak,Math.abs(out[i]));
  }
  const gain=Math.pow(10,peakDb/20)/Math.max(peak,1e-8);
  for(let i=0;i<out.length;i++){out[i]*=gain;squares+=out[i]*out[i];}
  return {samples:out,stats:{seconds:out.length/SR,peakDb,rmsDb:20*Math.log10(Math.sqrt(squares/out.length)),first:out[0],last:out[out.length-1]}};
}
function wav(samples) {
  const out=Buffer.alloc(44+samples.length*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(SR,24);out.writeUInt32LE(SR*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);
  samples.forEach((x,i)=>out.writeInt16LE(Math.round(clamp(x,-1,1)*32767),44+i*2));return out;
}
module.exports={SR,effect,voice,finish,wav,hash};
