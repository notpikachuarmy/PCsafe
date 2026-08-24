
"use strict";

/* Safe the PC - MVP web build
   Sin motor externo. Compatible con GitHub Pages: solo HTML/CSS/JS + imágenes.
*/

const $ = s => document.querySelector(s);
const canvas = $("#gameCanvas"), ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height, TILE = 32;
const COLS = W/TILE, ROWS = H/TILE;

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
$("#retry").onclick=()=>show("menu");

function makeGame(){
 return {
  running:true, round:1, phase:"fight",
  hp:100,maxHp:100,
  player:{x:W/2-16,y:H/2+55,speed:180,damage:4,attackCd:0,attackRate:.42,attackRange:48},
  disk:{x:W/2,y:H/2,range:150,damage:2,fireRate:.9,fireCd:.15,accuracy:.16,shots:1,back:false},
  enemies:[], projectiles:[], enemyProjectiles:[], particles:[],
  spawnLeft:7, spawnTimer:0, spawnInterval:.85,
  kills:0, constructionRadius:4,
  upgrades:{},
  waveTarget:7
 };
}

function startGame(){
 game=makeGame(); show("game"); last=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
}

function tileCenter(c,r){return {x:c*TILE+TILE/2,y:r*TILE+TILE/2}}
function diskTile(){return {c:Math.floor(COLS/2),r:Math.floor(ROWS/2)}}

function constructionBounds(){
 const d=diskTile(), rad=game.constructionRadius;
 return {minC:Math.max(0,d.c-rad),maxC:Math.min(COLS-1,d.c+rad),minR:Math.max(0,d.r-rad),maxR:Math.min(ROWS-1,d.r+rad)}
}

/* Regla de justicia solicitada:
   Los enemigos NO aparecen dentro ni pegados al área construible.
   Se genera un anillo exterior con una distancia mínima de SPAWN_GAP tiles.
*/
const SPAWN_GAP=3;
function randomSpawn(){
 const b=constructionBounds();
 const candidates=[];
 for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
   const outside = c < b.minC-SPAWN_GAP || c > b.maxC+SPAWN_GAP ||
                   r < b.minR-SPAWN_GAP || r > b.maxR+SPAWN_GAP;
   if(outside) candidates.push(tileCenter(c,r));
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
 updatePlayer(dt); updateDisk(dt); updateSpawns(dt); updateEnemies(dt); updateProjectiles(dt); updateParticles(dt);
 if(game.phase==="fight" && game.spawnLeft<=0 && game.enemies.length===0 && game.projectiles.length===0){
   endRound();
 }
}

function updatePlayer(dt){
 const p=game.player; let dx=0,dy=0;
 if(keys.has("w")||keys.has("arrowup"))dy--; if(keys.has("s")||keys.has("arrowdown"))dy++;
 if(keys.has("a")||keys.has("arrowleft"))dx--; if(keys.has("d")||keys.has("arrowright"))dx++;
 if(dx||dy){const l=Math.hypot(dx,dy);p.x+=dx/l*p.speed*dt;p.y+=dy/l*p.speed*dt}
 p.x=Math.max(16,Math.min(W-48,p.x));p.y=Math.max(16,Math.min(H-48,p.y));
 p.attackCd-=dt;
 if(keys.has(" ")&&p.attackCd<=0){
   let target=null,best=p.attackRange;
   for(const e of game.enemies){const d=Math.hypot(e.x+16-p.x-16,e.y+16-p.y-16);if(d<best){best=d;target=e}}
   if(target){target.hp-=p.damage; p.attackCd=p.attackRate; burst(target.x+16,target.y+16); if(target.hp<=0)killEnemy(target)}
 }
}
function updateDisk(dt){
 const d=game.disk; d.fireCd-=dt;
 if(d.fireCd<=0 && game.enemies.length){
  let target=null,best=d.range;
  for(const e of game.enemies){const dist=Math.hypot(e.x+16-d.x,e.y+16-d.y);if(dist<best){best=dist;target=e}}
  if(target){
   const base=Math.atan2(target.y+16-d.y,target.x+16-d.x);
   for(let i=0;i<d.shots;i++) fireSpark(base+(Math.random()-.5)*d.accuracy);
   if(d.back) fireSpark(base+Math.PI+(Math.random()-.5)*d.accuracy);
   d.fireCd=d.fireRate;
  }
 }
}
function fireSpark(a){
 game.projectiles.push({x:game.disk.x-8,y:game.disk.y-8,vx:Math.cos(a)*280,vy:Math.sin(a)*280,damage:game.disk.damage,life:1.8});
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
function burst(x,y){for(let i=0;i<8;i++)game.particles.push({x,y,vx:(Math.random()-.5)*70,vy:(Math.random()-.5)*70,life:.35+Math.random()*.3})}

function endRound(){
 game.phase="upgrade";
 stats.maxRound=Math.max(stats.maxRound,game.round);saveStats();
 const all=[
  {id:"spark",title:"CD chispa",desc:"+1 daño de chispa",apply:()=>game.disk.damage++},
  {id:"precision",title:"Chispas más precisas",desc:"Reduce la desviación un 40%",apply:()=>game.disk.accuracy*=.6},
  {id:"damage",title:"Más daño de chispa",desc:"+2 daño de chispa",apply:()=>game.disk.damage+=2},
  {id:"double",title:"Número de chispas",desc:"+1 proyectil por disparo",apply:()=>game.disk.shots++},
  {id:"rear",title:"Chispa trasera",desc:"Dispara también hacia atrás",apply:()=>game.disk.back=true}
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
 game.spawnLeft=Math.floor(7+game.round*2.2);
 game.spawnInterval=Math.max(.28,.85-game.round*.025);
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
 drawGrid(); drawBuildArea();
 const d=game.disk;
 ctx.drawImage(imgs.disk,d.x-30,d.y-30,60,60);
 for(const p of game.projectiles){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.drawImage(imgs.spark,-16,-16,32,32);ctx.restore()}
 for(const e of game.enemies){ctx.drawImage(imgs.bug,e.x,e.y,32,32);ctx.fillStyle="#e33";ctx.fillRect(e.x,e.y-5,32,3);ctx.fillStyle="#55d";ctx.fillRect(e.x,e.y-5,32*(e.hp/e.maxHp),3)}
 ctx.drawImage(imgs.player,game.player.x,game.player.y,32,32);
 for(const p of game.particles){ctx.fillStyle="#fff";ctx.globalAlpha=Math.max(0,p.life/.65);ctx.fillRect(p.x,p.y,3,3);ctx.globalAlpha=1}
 $("#round").textContent=game.round;$("#hp").textContent=`${game.hp} / ${game.maxHp}`;$("#alive").textContent=game.enemies.length;$("#runKills").textContent=game.kills;
}
function drawGrid(){
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
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
function loop(t){
 const dt=Math.min(.033,(t-last)/1000);last=t;
 update(dt);draw();raf=requestAnimationFrame(loop);
}
