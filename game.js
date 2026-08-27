
"use strict";

/* Safe the PC - MVP web build
   Sin motor externo. Compatible con GitHub Pages: solo HTML/CSS/JS + imágenes.
*/

const $ = s => document.querySelector(s);
const canvas = $("#gameCanvas"), ctx = canvas.getContext("2d");
let W=canvas.width,H=canvas.height; const TILE=32;
function resizeCanvas(){W=canvas.width=Math.max(640,innerWidth);H=canvas.height=Math.max(420,innerHeight-86)}
resizeCanvas(); addEventListener("resize",resizeCanvas);

const ASSET = {
  player:"Imagenes/Game character/Payer/player.png",
  bug:"Imagenes/Game character/Enemies/Bug1.png",
  disk:"Imagenes/Game character/Towers/Disco duro.png",
  spark:"Imagenes/Proyectiles/chispa.png",
  lance:"Imagenes/Proyectiles/Golpelanza.png",
  build:"Imagenes/Tiles/Constrible.png",
  neutral:"Imagenes/Tiles/Neutral.png",
  randes:"Imagenes/Character Dialogo/Randes.png",
  g:"Imagenes/Character Dialogo/IA.png",
  death:["Imagenes/Particles/deathenemi1.png","Imagenes/Particles/deathenemi2.png","Imagenes/Particles/deathenemi3.png"]
};
const imgs = {};
for(const [k,v] of Object.entries(ASSET)){
  if(Array.isArray(v)) imgs[k]=v.map(x=>{const i=new Image();i.src=x;return i});
  else {const i=new Image();i.src=v;imgs[k]=i}
}

const defaultStats = {totalKills:0,maxRound:0,byType:{Bug1:0},lossesByEnemy:{Bug1:0}};
let stats = JSON.parse(localStorage.getItem("safeThePCStats") || "null") || defaultStats;
function saveStats(){localStorage.setItem("safeThePCStats",JSON.stringify(stats));}

let game = null, last=0, raf=0;
const keys = new Set();
addEventListener("keydown",e=>{keys.add(e.key.toLowerCase()); if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(e.key.toLowerCase()))e.preventDefault()});
addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));

const dialogue = [
 ["Randes",ASSET.randes,"...¿G? ¿Dónde estamos?"],
 ["G",ASSET.g,"Dentro de tu PC. O, siendo más exactos, dentro de lo poco que queda de él."],
 ["Randes",ASSET.randes,"¿Cómo he acabado dentro de mi propio ordenador?"],
 ["G",ASSET.g,"Tu PC lleva demasiado tiempo sobreviviendo contra todo pronóstico. Ahora los Bugs han encontrado una forma de entrar y están atacando el disco duro."],
 ["Randes",ASSET.randes,"¿Y qué hacemos?"],
 ["G",ASSET.g,"Defenderlo. Yo vigilaré el sistema y tú tendrás que encargarte de los que consigan acercarse demasiado."],
 ["G",ASSET.g,"Te mueves con WASD o las flechas. Randes atacará automáticamente cuando un Bug entre en el alcance de su lanza. No tienes que pulsar ningún botón para atacar."],
 ["G",ASSET.g,"El disco duro dispara chispas por sí solo y su barra de vida está sobre él. Entre rondas tendrás tres mejoras para elegir, incluidas mejoras de la lanza."],
 ["G",ASSET.g,"Los enemigos aparecerán lejos del área de construcción para darte tiempo de reaccionar. El minimapa te mostrará el disco, a Randes y a los enemigos."],
 ["G",ASSET.g,"Puedes pausar con Escape o con el botón Pausa. Si abandonas, volverás al menú."],
 ["Randes",ASSET.randes,"Entonces vamos a salvar este cacharro."],
 ["G",ASSET.g,"Exacto, Randes. Bienvenido a Safe the PC."]
];
let dialogueIndex=0;

function show(id){
 document.querySelectorAll(".screen").forEach(x=>x.classList.add("hidden"));
 $("#"+id).classList.remove("hidden");
}
function startDialogue(){
 dialogueIndex=0; renderDialogue(); show("dialogue");
}
function renderDialogue(){
 const [name,img,text]=dialogue[dialogueIndex];
 $("#speaker").textContent=name;
 $("#dialoguePortrait").src=img;
 $("#dialoguePortrait").alt=name;
 $("#dialogueText").textContent=text;
 $("#nextDialogue").textContent=dialogueIndex===dialogue.length-1?"Terminar":"Continuar";
}
$("#nextDialogue").onclick=()=>{
 if(dialogueIndex<dialogue.length-1){dialogueIndex++;renderDialogue()}
 else show("menu");
};
$("#btnDialogue").onclick=startDialogue;
$("#btnStart").onclick=startGame;
if(!sessionStorage.getItem("safeThePCIntroSeen")){
  sessionStorage.setItem("safeThePCIntroSeen","1");
  startDialogue();
}
$("#btnStats").onclick=()=>{
 const types=Object.entries(stats.byType).map(([k,v])=>`<li>${k}: ${v}</li>`).join("");
 const losses=Object.entries(stats.lossesByEnemy).map(([k,v])=>`<li>${k}: ${v}</li>`).join("");
 $("#statsContent").innerHTML=`
  <p><b>Enemigos totales asesinados:</b> ${stats.totalKills}</p>
  <p><b>Ronda máxima:</b> ${stats.maxRound}</p>
  <h3>Enemigos derrotados por tipo</h3><ul>${types||"<li>Ninguno</li>"}</ul>
  <h3>Enemigos que han hecho perder</h3><ul>${losses||"<li>Ninguno</li>"}</ul>`;
 show("stats");
};
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show(b.dataset.back));
$("#retry").onclick=()=>{ $("#gameOverOverlay").classList.add("hidden"); show("menu"); };
$("#pauseBtn").onclick=togglePause;
$("#resumeBtn").onclick=togglePause;
$("#abandonBtn").onclick=()=>{
  if(game){game.running=false;game.paused=false}
  $("#pauseOverlay").classList.add("hidden");
  show("menu");
};

function makeGame(){
 return {
  running:true, paused:false, round:1, phase:"fight",
  hp:100,maxHp:100,
  player:{x:W/2-16,y:H/2+55,speed:180,damage:4,attackCd:0,attackRate:.42,attackRange:48,facing:1},
  disk:{x:3200,y:2400,range:420,damage:2,fireRate:.9,fireCd:.05,accuracy:.16,shots:1,back:false},
  enemies:[], projectiles:[], lanceProjectiles:[], enemyProjectiles:[], particles:[],
  spawnLeft:3, spawnTimer:0.15, spawnInterval:1.4,
  kills:0, constructionRadius:4, upgrades:{},
  camera:{x:0,y:0}, world:{w:6400,h:4800},
  waveTarget:3
 };
}

function startGame(){
 game=makeGame();
 game.player.x=game.world.w/2-16; game.player.y=game.world.h/2+55;
 game.disk.x=game.world.w/2; game.disk.y=game.world.h/2;
 show("game"); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
}

function tileCenter(c,r){return {x:c*TILE+TILE/2,y:r*TILE+TILE/2}}
function diskTile(){return {c:Math.floor(COLS/2),r:Math.floor(ROWS/2)}}

function constructionBounds(){
 const d={c:Math.floor(game.world.w/2/TILE),r:Math.floor(game.world.h/2/TILE)}, rad=game.constructionRadius;
 return {minC:d.c-rad,maxC:d.c+rad,minR:d.r-rad,maxR:d.r+rad}
}
const SPAWN_GAP=3; // casillas exactas entre el borde de construcción y el spawn
function randomSpawn(){
 const b=constructionBounds();
 const gap=SPAWN_GAP;
 const minC=b.minC-gap, maxC=b.maxC+gap;
 const minR=b.minR-gap, maxR=b.maxR+gap;
 const candidates=[];

 // Spawn on the four sides of the construction area, exactly in the
 // first ring outside the safety gap. This keeps enemies close enough
 // to be relevant while never spawning inside the buildable zone.
 for(let c=minC;c<=maxC;c++){
   if(minR>=1 && minR<Math.floor(game.world.h/TILE)-1) candidates.push(tileCenter(c,minR));
   if(maxR>=1 && maxR<Math.floor(game.world.h/TILE)-1) candidates.push(tileCenter(c,maxR));
 }
 for(let r=minR+1;r<maxR;r++){
   if(minC>=1 && minC<Math.floor(game.world.w/TILE)-1) candidates.push(tileCenter(minC,r));
   if(maxC>=1 && maxC<Math.floor(game.world.w/TILE)-1) candidates.push(tileCenter(maxC,r));
 }
 return candidates[(Math.random()*candidates.length)|0];
}
function spawnEnemy(){
 const p=randomSpawn();
 game.enemies.push({x:p.x-12,y:p.y-12,hp:10,maxHp:10,speed:28,damage:1,attackCd:0,attackRate:1,dead:false});
}
function nearestTarget(e){
 return {x:game.disk.x,y:game.disk.y};
}

function update(dt){
 if(!game.running)return;
 updatePlayer(dt); updateDisk(dt); updateSpawns(dt); updateEnemies(dt); updateProjectiles(dt); updateLanceProjectiles(dt); updateParticles(dt);
 if(game.phase==="fight" && game.spawnLeft<=0 && game.enemies.length===0 && game.projectiles.length===0){
   endRound();
 }
}

function updatePlayer(dt){
 const p=game.player; let dx=0,dy=0;
 if(keys.has("w")||keys.has("arrowup"))dy--; if(keys.has("s")||keys.has("arrowdown"))dy++;
 if(keys.has("a")||keys.has("arrowleft"))dx--; if(keys.has("d")||keys.has("arrowright"))dx++;
 if(dx||dy){
   const l=Math.hypot(dx,dy); p.x+=dx/l*p.speed*dt; p.y+=dy/l*p.speed*dt;
   if(dx<0)p.facing=-1; else if(dx>0)p.facing=1;
 }
 p.x=Math.max(16,Math.min(game.world.w-48,p.x));p.y=Math.max(16,Math.min(game.world.h-48,p.y));
 p.attackCd-=dt;
 let target=null,best=p.attackRange;
 for(const e of game.enemies){
   const d=Math.hypot(e.x+16-p.x-16,e.y+16-p.y-16);
   if(d<best){best=d;target=e}
 }
 if(target&&p.attackCd<=0){
   const a=Math.atan2(target.y+16-(p.y+16),target.x+16-(p.x+16));
   game.lanceProjectiles.push({x:p.x+16,y:p.y+16,vx:Math.cos(a)*420,vy:Math.sin(a)*420,life:.18,damage:p.damage});
   p.attackCd=p.attackRate; p.facing=(target.x+16 < p.x+16)?-1:1;
 }
}
function updateDisk(dt){
 const d=game.disk; d.fireCd-=dt;
 if(d.fireCd>0 || game.enemies.length===0) return;
 let target=null,best=Infinity;
 for(const e of game.enemies){if(e.dead)continue;const dist=Math.hypot(e.x+16-d.x,e.y+16-d.y);if(dist<best && dist<=d.range){best=dist;target=e}}
 if(!target)return;
 const base=Math.atan2(target.y+16-d.y,target.x+16-d.x);
 const count=Math.max(1,Number(d.shots)||1);
 for(let i=0;i<count;i++)fireSpark(base+(Math.random()-.5)*d.accuracy);
 if(d.back)fireSpark(base+Math.PI+(Math.random()-.5)*d.accuracy);
 d.fireCd=d.fireRate;
}
function fireSpark(a){
 const speed=280;
 game.projectiles.push({x:game.disk.x,y:game.disk.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,damage:Math.max(1,Number(game.disk.damage)||1),life:2.2});
}
function updateSpawns(dt){
 if(game.spawnLeft<=0)return;
 game.spawnTimer-=dt;
 if(game.spawnTimer<=0){spawnEnemy();game.spawnLeft--;game.spawnTimer=game.spawnInterval}
}
function updateEnemies(dt){
 for(const e of game.enemies){
  if(e.dead)continue;
  const t=nearestTarget(e), dx=t.x-(e.x+16),dy=t.y-(e.y+16),dist=Math.hypot(dx,dy);
  if(dist>30){e.x+=dx/dist*e.speed*dt;e.y+=dy/dist*e.speed*dt}
  else {e.attackCd-=dt;if(e.attackCd<=0){game.hp=Math.max(0,game.hp-e.damage);e.attackCd=e.attackRate;if(game.hp<=0){loseGame(e)}}}
 }
}
function updateLanceProjectiles(dt){
 for(const p of game.lanceProjectiles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;for(const e of game.enemies){if(!e.dead&&Math.hypot(p.x-(e.x+16),p.y-(e.y+16))<18){e.hp-=p.damage;p.life=0;if(e.hp<=0)killEnemy(e);break}}}
 game.lanceProjectiles=game.lanceProjectiles.filter(p=>p.life>0);
}
function updateProjectiles(dt){
 for(const p of game.projectiles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
  for(const e of game.enemies){if(e.dead)continue;if(Math.hypot(p.x-(e.x+16),p.y-(e.y+16))<18){e.hp-=p.damage;p.life=0;if(e.hp<=0)killEnemy(e);break}}
 }
 game.projectiles=game.projectiles.filter(p=>p.life>0&&p.x>-40&&p.x<W+40&&p.y>-40&&p.y<H+40);
}
function updateParticles(dt){for(const p of game.particles)p.life-=dt;game.particles=game.particles.filter(p=>p.life>0)}
function killEnemy(e){
 if(e.dead)return;e.dead=true;game.kills++;stats.totalKills++;stats.byType.Bug1=(stats.byType.Bug1||0)+1;saveStats();burst(e.x+16,e.y+16);
 game.enemies=game.enemies.filter(x=>x!==e);
}
function burst(x,y){for(let i=0;i<10;i++)game.particles.push({x,y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,life:.45+Math.random()*.35,sprite:imgs.death[i%imgs.death.length],size:12+Math.random()*10})}

function endRound(){
 game.phase="upgrade";
 stats.maxRound=Math.max(stats.maxRound,game.round);saveStats();
 const all=[
  {id:"spark",title:"CD chispa",desc:"+1 daño de chispa",apply:()=>game.disk.damage++},
  {id:"precision",title:"Chispas más precisas",desc:"Reduce la desviación un 40%",apply:()=>game.disk.accuracy*=.6},
  {id:"damage",title:"Más daño de chispa",desc:"+2 daño de chispa",apply:()=>game.disk.damage+=2},
  {id:"double",title:"Número de chispas",desc:"+1 proyectil por disparo",apply:()=>game.disk.shots++},
  {id:"rear",title:"Chispa trasera",desc:"Dispara también hacia atrás",apply:()=>game.disk.back=true},
  {id:"lanceDamage",title:"Lanza: daño",desc:"+2 daño al ataque automático de Randes",apply:()=>game.player.damage+=2},
  {id:"lanceRange",title:"Lanza: alcance",desc:"+18 de alcance de ataque automático",apply:()=>game.player.attackRange+=18}
 ];
 const choices=[...all].sort(()=>Math.random()-.5).slice(0,3);
 $("#upgradeChoices").innerHTML="";
 for(const u of choices){
  const b=document.createElement("button");b.className="choice";
  b.innerHTML=`<strong>${u.title}</strong><small>${u.desc}</small>`;
  b.onclick=()=>{u.apply();$("#upgradeOverlay").classList.add("hidden");nextRound()};
  $("#upgradeChoices").appendChild(b);
 }
 $("#upgradeOverlay").classList.remove("hidden");
}
function nextRound(){
 game.round++;
 game.phase="fight";
 game.spawnLeft=Math.floor(3+game.round*1.25);
 game.spawnInterval=Math.max(.55,1.4-game.round*.025);
 game.constructionRadius=Math.min(7,4+Math.floor(game.round/4));
 game.enemies=[];
 game.hp=Math.min(game.maxHp,game.hp+5);
}
function loseGame(killer){
 game.running=false;
 stats.lossesByEnemy.Bug1=(stats.lossesByEnemy.Bug1||0)+1;stats.maxRound=Math.max(stats.maxRound,game.round);saveStats();
 $("#gameOverText").textContent=`Un Bug 1 ha conseguido destruir el disco duro. Llegaste a la ronda ${game.round}.`;
 $("#gameOverOverlay").classList.remove("hidden");
}

function draw(){
 ctx.clearRect(0,0,W,H);
 updateCamera();
 ctx.save(); ctx.translate(-game.camera.x,-game.camera.y);
 drawGrid(); drawBuildArea();
 const d=game.disk;
 ctx.drawImage(imgs.disk,d.x-30,d.y-30,60,60);
 // Barra de vida integrada sobre el disco
 ctx.fillStyle="#1b1b1b";ctx.fillRect(d.x-34,d.y-43,68,7);
 ctx.fillStyle="#52d273";ctx.fillRect(d.x-34,d.y-43,68*(game.hp/game.maxHp),7);
 for(const p of game.projectiles){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));if(imgs.spark.complete && imgs.spark.naturalWidth)ctx.drawImage(imgs.spark,-6,-6,12,12);else{ctx.fillStyle="#fff36a";ctx.fillRect(-5,-2,10,4)}ctx.restore();}
 for(const p of game.lanceProjectiles){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.drawImage(imgs.lance,-16,-16,32,32);ctx.restore();}
 for(const e of game.enemies){
   ctx.drawImage(imgs.bug,e.x,e.y,32,32);
   ctx.fillStyle="#e33";ctx.fillRect(e.x,e.y-5,32,3);
   ctx.fillStyle="#55d";ctx.fillRect(e.x,e.y-5,32*(e.hp/e.maxHp),3)
 }
 ctx.save();
 if(game.player.facing<0){ctx.translate(game.player.x+32,game.player.y);ctx.scale(-1,1);ctx.drawImage(imgs.player,0,0,32,32)}
 else ctx.drawImage(imgs.player,game.player.x,game.player.y,32,32);
 ctx.restore();
 for(const p of game.particles){ctx.globalAlpha=Math.max(0,p.life/.8);ctx.drawImage(p.sprite,p.x-p.size/2,p.y-p.size/2,p.size,p.size);ctx.globalAlpha=1}
 ctx.restore();
 drawMinimap();
 $("#round").textContent=game.round;$("#hp").textContent=`${game.hp} / ${game.maxHp}`;$("#alive").textContent=game.enemies.length;$("#runKills").textContent=game.kills;
}
function updateCamera(){
 const targetX=game.player.x-W*.43+16,targetY=game.player.y-H*.43+16;
 game.camera.x=Math.max(0,Math.min(game.world.w-W,targetX));
 game.camera.y=Math.max(0,Math.min(game.world.h-H,targetY));
}
function drawMinimap(){
 const mw=190,mh=120,mx=W-mw-14,my=14;
 ctx.fillStyle="#070a10";ctx.globalAlpha=.9;ctx.fillRect(mx,my,mw,mh);ctx.globalAlpha=1;
 ctx.strokeStyle="#7a859c";ctx.strokeRect(mx,my,mw,mh);
 const sx=mw/game.world.w,sy=mh/game.world.h;
 ctx.fillStyle="#49d6ff";ctx.fillRect(mx+game.disk.x*sx-3,my+game.disk.y*sy-3,6,6);
 ctx.fillStyle="#ffd34d";ctx.fillRect(mx+game.player.x*sx-3,my+game.player.y*sy-3,6,6);
 ctx.fillStyle="#ff5268";
 for(const e of game.enemies)ctx.fillRect(mx+(e.x+16)*sx-2,my+(e.y+16)*sy-2,4,4);
 ctx.strokeStyle="#fff";ctx.strokeRect(mx+game.camera.x*sx,my+game.camera.y*sy,W*sx,H*sy);
}
function drawGrid(){
 const maxC=Math.floor(game.world.w/TILE), maxR=Math.floor(game.world.h/TILE);
 for(let r=0;r<maxR;r++)for(let c=0;c<maxC;c++){
   ctx.drawImage(imgs.neutral,c*TILE,r*TILE,TILE,TILE);
 }
}
function drawBuildArea(){
 const b=constructionBounds();
 for(let r=b.minR;r<=b.maxR;r++)for(let c=b.minC;c<=b.maxC;c++){
  ctx.globalAlpha=.55;ctx.drawImage(imgs.build,c*TILE,r*TILE,TILE,TILE);ctx.globalAlpha=1;
 }
 ctx.strokeStyle="#7bc7ff";ctx.lineWidth=2;ctx.strokeRect(b.minC*TILE,b.minR*TILE,(b.maxC-b.minC+1)*TILE,(b.maxR-b.minR+1)*TILE);
}
function togglePause(){
 if(!game||!game.running)return;
 game.paused=!game.paused;
 $("#pauseOverlay").classList.toggle("hidden",!game.paused);
}
addEventListener("keydown",e=>{if(e.key==="Escape"&&game)togglePause()});
function loop(t){
 const dt=Math.min(.033,(t-last)/1000);last=t;
 if(!game.paused)update(dt);
 draw();raf=requestAnimationFrame(loop);
}
