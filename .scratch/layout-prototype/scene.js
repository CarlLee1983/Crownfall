// Three battlefield sketches using Crownfall's gameplay camera.
import * as T from 'three';
import {createCamera} from '../../src/render/camera.ts';
const variants=[
 {name:'A 河谷折返',main:[[15,11],[4,11],[4,7],[12,7],[12,3],[2,3]],alt:[[4,9],[2,9],[2,6],[4,6],[4,7]],block:[4,8],pads:[[9,10],[5,8],[10,6],[7,2]]},
 {name:'B 雙岸環道',main:[[27,4],[22,4],[22,15],[7,15],[7,18],[2,18]],alt:[[22,4],[7,4],[7,15]],block:[22,9],pads:[[25,7],[19,9],[16,12],[10,7],[4,12],[11,18],[26,1],[17,1],[12,1],[3,6],[20,18],[3,21]]},
 {name:'C 山口串關',main:[[15,11],[10,11],[10,8],[7,8],[7,5],[3,5],[3,2]],alt:[[10,11],[8,11],[8,9],[6,9],[6,7],[7,7]],block:[10,9],pads:[[12,10],[9,7],[6,6],[4,3]]}
];
const key=new URLSearchParams(location.search).get('variant')||'A';
const index=Math.max(0,['A','B','C'].indexOf(key)), v=variants[index];
document.querySelector('#title').textContent=v.name;
function change(n){location.search='?variant='+['A','B','C'][(index+n+3)%3]}
prev.onclick=()=>change(-1);next.onclick=()=>change(1);
onkeydown=e=>{if(e.key==='ArrowLeft')change(-1);if(e.key==='ArrowRight')change(1)};
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setClearColor(0x182626);
const wide=index===1, width=wide?30:18, height=wide?23:15;
const scene=new T.Scene(),view=createCamera({width,height,cells:[{layer:1}]});
scene.add(new T.HemisphereLight(0xfff7de,0x8ba595,2));
const sun=new T.DirectionalLight(0xffedce,2);sun.position.set(-4,12,7);scene.add(sun);
function box(x,y,z,w,h,d,color){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color}));m.position.set(x,y,z);scene.add(m);return m}
function cells(path){const list=[path[0]];for(const [tx,tz] of path.slice(1)){let [x,z]=list.at(-1);while(x!==tx||z!==tz){x+=Math.sign(tx-x);z+=Math.sign(tz-z);list.push([x,z])}}return list}
const main=cells(v.main),alt=cells(v.alt),roads=new Set([...main,...alt].map(String));
for(let z=0;z<height;z++)for(let x=0;x<width;x++){
 const d=Math.min(...[...main,...alt].map(([a,b])=>Math.hypot(x-a,z-b)));
 const meadow=wide && Math.hypot((x-14.5)/14,(z-11)/10)<1+.065*Math.sin(x*.6+z*.35);
 if(!meadow&&(!wide||!v.pads.some(([a,b])=>Math.max(Math.abs(a-x),Math.abs(b-z))<=1))&&d>2.3+.65*Math.sin(x*.9+z*.6))continue;
 box(x,-.28,z,1,.55,1,roads.has(String([x,z]))?0xaa936b:d>1.7?0x425c4a:0x577356);
}
if(wide){
 const foliage=new T.IcosahedronGeometry(1,0);
 const stone=new T.DodecahedronGeometry(1,0);
 const blade=new T.ConeGeometry(.1,.48,3);
 function detail(shape,color,x,y,z,w,h,d){
  const mesh=new T.Mesh(shape,new T.MeshStandardMaterial({color,flatShading:true}));
  mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.y=x+z;scene.add(mesh);
 }
 for(const [x,z,h] of [[2,9,1.9],[3,9.5,2.2],[4,8.8,1.5],[12,9,1.8],[13.4,9.4,1.4]]){
  box(x,h*.32,z,.23,h*.64,.23,0x634c35);
  detail(foliage,0x426746,x,h*.76,z,.72,h*.45,.78);
 }
 for(const [x,z,r] of [[23.8,11,.65],[24.8,10.7,.42],[24.5,12,.55],[9.7,12,.52],[10.5,12.5,.35]]){
  detail(stone,0x899489,x,r*.38,z,r,r*.72,r*.81);
 }
 for(let z=2;z<21;z++)for(let x=2;x<28;x++){
  if((x*13+z*7)%9!==0||Math.hypot((x-14.5)/13,(z-11)/9)>.96)continue;
  if(roads.has(String([x,z]))||v.pads.some(([a,b])=>Math.max(Math.abs(a-x),Math.abs(b-z))<2))continue;
  for(const offset of [-.18,0,.18])detail(blade,0x97a862,x+offset,.21,z+offset*.5,1,1,1);
 }
}
const scale=wide?3.05:1;
for(const [x,z] of v.pads){box(x,.15,z,.95*scale,.3,.95*scale,0x736a52);box(x,.32,z,.85*scale,.06,.85*scale,0xe7bc55);box(x,.36,z,.62*scale,.03,.62*scale,0x504e43)}
if(wide){
 const [x,z]=v.pads[1];
 box(x,1.12,z,1.48,1.5,1.48,0x807561);
 box(x,2.04,z,1.8,.38,1.8,0xb8a37a);
 for(const dx of [-.65,.65])for(const dz of [-.65,.65])box(x+dx,2.4,z+dz,.45,.48,.45,0xb8a37a);
}
const [sx,sz]=main[0],[gx,gz]=main.at(-1);
box(sx,.8,sz,.1,1.6,.1,0xe2cdb3);box(sx+.35,1.38,sz,.7,.46,.08,0xd34035);
box(gx,.55,gz,1.45,1.1,1.25,0xdcd9ca);
for(const dx of [-.6,.6])for(const dz of [-.5,.5])box(gx+dx,.8,gz+dz,.35,1.6,.35,0xe9e4cf);
const [bx,bz]=v.block, barrier=box(bx,.06,bz,wide?1.65:.84,.1,wide?1.45:.72,0xc67a40);
let blocked=false,marks=[];
function draw(){for(const m of marks)scene.remove(m);marks=[];
 const start=main.findIndex(p=>String(p)===String(alt[0])),end=main.findIndex(p=>String(p)===String(alt.at(-1)));
 const route=blocked?[...main.slice(0,start),...alt,...main.slice(end+1)]:main;
 for(const [x,z] of route)marks.push(box(x,.045,z,.17,.04,.17,0xffedab));
 barrier.scale.y=blocked?7:1;barrier.position.y=blocked?.36:.06;
 renderer.render(scene,view.camera)}
toggle.onclick=()=>{blocked=!blocked;toggle.textContent=blocked?'移除路障':'放置路障';draw()};
function resize(){renderer.setSize(innerWidth,innerHeight,false);view.resize(innerWidth/innerHeight);draw()}onresize=resize;resize();
