"""One-time authored operation logs, rasterized by draw / draw-sheet. Not part of build."""
import json, random, subprocess, pathlib, concurrent.futures, math
ROOT=pathlib.Path('/work'); random.seed(417)
jobs=[]
def rect(a,x,y,w,h,c): a.append(dict(op='fill_rect',x=int(x),y=int(y),width=int(w),height=int(h),color=c))
def line(a,x,y,xx,yy,c): a.append(dict(op='line',x0=int(x),y0=int(y),x1=int(xx),y1=int(yy),color=c))
def circle(a,x,y,r,c): a.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def poly(a,points,c):
 for y in range(min(p[1] for p in points),max(p[1] for p in points)+1):
  xs=[]
  for i,(x0,y0) in enumerate(points):
   x1,y1=points[(i+1)%len(points)]
   if min(y0,y1)<=y<max(y0,y1):xs.append(x0+(y-y0)*(x1-x0)/(y1-y0))
  if len(xs)>1:rect(a,min(xs),y,max(xs)-min(xs)+1,1,c)
def save(name,a,w=80,h=80,sheet=False):
 p=ROOT/'assets'/name;p.parent.mkdir(parents=True,exist_ok=True)
 log=ROOT/'tools'/'art-logs'/(name+'.json'); log.parent.mkdir(parents=True,exist_ok=True);log.write_text(json.dumps(a))
 jobs.append([('draw-sheet' if sheet else 'draw'),'render','--actions',str(log),'--out',str(p),'--width',str(w),'--height',str(h),'--no-layers'])
def shade(c,f):
 return '#'+''.join(f'{max(0,min(255,int(int(c[i:i+2],16)*f))):02x}' for i in (1,3,5))
# Fine-grained sediment, small angular seams and cross-bedding, evenly distributed.
for b,c in [('topsoil','#6b5046'),('rockbed','#485665'),('deepstone','#343b50'),('coreshell','#593940')]:
 for n in range(3):
  a=[];rect(a,0,0,80,80,c)
  for i in range(520):
   x=random.randrange(80);y=random.randrange(80);rect(a,x,y,random.choice([1,2,3,4]),random.choice([1,1,2]),shade(c,random.uniform(.65,1.35)))
  for j in range(5):
   x=random.randrange(80);y=random.randrange(80);line(a,x,y,x+random.randrange(8,28),y+random.randrange(-4,5),shade(c,.53));line(a,x,y-1,x+15,y-2,shade(c,1.18))
  save(f'tiles/{b}-{n}.png',a)
a=[];rect(a,0,0,80,80,'#121e2b')
for y in range(0,80,20):
 for x in range(-20,80,40):
  xx=x+(20 if y%40 else 0);rect(a,xx+2,y+2,37,17,'#283644');line(a,xx+2,y+2,xx+37,y+2,'#4d6472')
save('tiles/bedrock.png',a)
a=[];rect(a,0,0,80,80,'#141b25')
for i in range(100):rect(a,random.randrange(80),random.randrange(80),2,1,random.choice(['#1a222d','#1f2933','#101720']))
save('tiles/tunnel.png',a)
for n in range(2):
 a=[]
 points=[(8,30),(20,12),(47,7+n*4),(67,20),(74,44-n*4),(61,69),(34,75),(12,58)]
 poly(a,points,'#142736');poly(a,[(x,y-3) for x,y in points],'#80959a')
 poly(a,[(12,31),(26,17),(49,12),(63,25),(68,44),(56,63),(33,68),(16,52)],'#506a79')
 poly(a,[(49,12),(63,25),(68,44),(56,63),(33,68),(46,49)],'#314b60')
 poly(a,[(12,31),(26,17),(49,12),(46,24),(27,31)],'#90a5a7')
 for i in range(5):line(a,22+i*5,36-i*2,25+i*5,35-i*2,'#a4b7b6')
 line(a,21,54,34,61,'#263e50');save(f'tiles/stone-{n}.png',a)
colors=['#cc8067','#ddd1ac','#e8a053','#dbe7e9','#5ea7de','#8de6d3','#c2b3f1','#ff9c54','#ed6e69','#cef0ef','#67edb0','#ff9fce','#ffda77']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for k,(name,c) in enumerate(zip(names,colors)):
 a=[]
 if k<10:
  for x in range(0,80,2):
   y=int(36+12*math.sin(x/26)+3*math.sin(x/5))
   for j in range(8):
    yy=y+random.randrange(-14,15);rect(a,x,yy,random.randrange(2,7),random.randrange(1,4),shade(c,random.uniform(.65,1.2)) + random.choice(['55','88','bb','ff']))
   line(a,x,y,x+3,y+1,shade(c,1.2))
 else:
  # Faceted octagonal jewel, scanline polygon via bars and facet boundaries.
  for y in range(17,64):
   wid=int(25-abs(y-35)*.6);rect(a,40-wid,y,wid*2,1,shade(c,.72 if y>35 else 1))
  rect(a,28,23,25,15,shade(c,1.2));line(a,16,35,40,62,shade(c,1.4));line(a,63,35,40,62,shade(c,.5));line(a,28,38,40,62,shade(c,.55));line(a,53,38,40,62,shade(c,1.15));line(a,28,23,16,35,'#efffff');line(a,20,17,20,33,'#ffffff');line(a,12,25,28,25,'#ffffff')
 save(f'ore/{name}.png',a)
for name,c in [('resonite','#a6f4b3'),('cryenite','#8fd7ff'),('core','#ffbd69'),('core-sample','#ffad60')]:
 a=[]
 for x,y,h in [(24,35,29),(40,20,45),(54,39,27)]:
  for yy in range(y-9,y+h):
   ww=min(8,yy-y+10);rect(a,x-ww,yy,ww*2,1,shade(c,.7))
  rect(a,x-4,y,4,h,shade(c,1.1));line(a,x,y-8,x+7,y,c);line(a,x,y-8,x-7,y,'#ffffff')
 if name=='core':
  circle(a,40,40,28,'#783936aa');circle(a,40,40,18,'#f6ad62');circle(a,36,36,10,'#fff3b5')
 save(f'materials/{name}.png',a)
for n in range(4):
 a=[]
 for ang in [0.2,1.4,2.6,3.7,5.2]:
  x,y=40,40
  for s in range(n+2):
   xx=x+math.cos(ang+s*.2)*9; yy=y+math.sin(ang+s*.2)*9;line(a,x+1,y,xx+1,yy,'#d0b39d66');line(a,x,y,xx,yy,'#111722dd');x,y=xx,yy
 save(f'tiles/crack/frame{n:02}.png',a,sheet=True)
for n in range(3):
 a=[];rect(a,0,0,80,80,'#b74734')
 for y in range(80):
  for x in range(0,80,2):
   t=math.sin(x*.12+y*.1+n*2)+math.sin(y*.28-x*.07+n)
   if t>.35:rect(a,x,y,2,1,'#f47b3e' if t<1 else '#ffc36b')
 for i in range(30):rect(a,random.randrange(80),random.randrange(80),random.randrange(3,13),2,'#672c31')
 save(f'hazards/lava/frame{n:02}.png',a,sheet=True)
# Consistent suited prospector: cold pack, amber shell, cyan visor, gloved hands, fluted drill.
for state,count in [('idle',2),('walk',4),('drill-down',3),('drill-side',3),('jetpack',3),('fall',2),('hurt',2),('fuel-out',2)]:
 for f in range(count):
  a=[];bob=(f%2) if state=='idle' else ([-1,1,0,1][f] if state!='hurt' else [-4,-1][f]);bx=0 if state!='hurt' else [-5,-2][f]
  hx=5 if state=='fuel-out' else 3 if state=='drill-side' else -3 if state in ['fall','hurt'] else 1 if state=='drill-down' else 0
  hy=7 if state=='fuel-out' else 4 if state=='drill-down' else -3 if state in ['fall','hurt'] else 0
  def R(x,y,w,h,c):rect(a,x+bx,y+bob,w,h,c)
  def H(x,y,w,h,c):R(x+hx,y+hy,w,h,c)
  # silhouette outline, pack and antenna
  R(8,29,17,30,'#101c29');R(9,31,12,25,'#63858d');R(11,32,6,21,'#a0bbc0');R(7,39,4,9,'#df8751');R(15,17,2,15,'#aac4c5')
  legs=[(24,58,12,14),(42,58,12,14)]
  if state=='walk':legs=[(22+[-4,0,5,0][f],57,12,14),(42+[5,0,-4,0][f],57,12,14)]
  if state in ['fall','jetpack']:legs=[(20,56,12,12),(45,51,12,16)]
  if state in ['drill-down','drill-side']:legs=[(18,58,14,13),(45,57,14,14)]
  if state=='fuel-out':legs=[(24,58,12,14),(43,60,12,12)]
  if state=='hurt':legs=[(18,53,13,14),(44,58,13,13)]
  for x,y,w,h in legs:R(x-2,y-2,w+4,h+4,'#111c28');R(x,y,w,h,'#7c9398');R(x,y+8,w+4,5,'#253848');R(x+1,y,4,6,'#cad8d1')
  R(20,29,37,33,'#101c29');R(23,31,31,28,'#cc8950');R(24,33,7,21,'#f2b75f');R(33,34,16,17,'#96704e');R(34,37,13,9,'#293e4a');R(36,39,3,3,'#8ce9d6');R(44,39,3,3,'#dce6c9');R(24,55,31,5,'#3b4e57')
  # helmet
  H(19,8,37,25,'#101c29');H(23,6,29,6,'#1a2833');H(21,11,33,21,'#e3b267');H(24,8,26,5,'#f6d28a');H(28,14,29,15,'#132e43');H(31,16,24,9,'#5cabb6');H(34,16,18,3,'#b8e7d8');H(48,20,7,4,'#2c6a85');H(19,14,7,12,'#9a7351');H(46,7,12,7,'#e5d5a1');H(50,8,6,5,'#798b83' if state=='fuel-out' else '#fff5c9' if f%2==0 else '#a8ded6')
  # The same tool is swung, braced, raised in freefall, and allowed to droop powerless.
  down=state=='drill-down'; dy=([-2,1,2,-1][f] if state=='walk' else -9 if state=='fall' else -6 if state=='hurt' else f%2*2 if state=='drill-side' else 0)
  if state=='fuel-out':
   R(46,39,12,17,'#edb766');R(48,53,11,9,'#1f3542');R(50,54,8,4,'#acbdba');R(51,59,14,11,'#456171');R(53,59,10,3,'#bdd0c8');R(61,68,8,5,'#a8bfc1');R(67,73,5,4,'#7f9da8')
  else:
   R(45,34+min(0,dy),12,13,'#edb766');R(48,44+dy,15,8,'#1f3542');R(51,44+dy,8,4,'#acbdba')
   if down:
    R(44,48,16,15,'#3a5968');R(45,49,13,6,'#a1c0c0');R(48,63,8,8,'#c7d3c8');R(50,71,4,5,'#6d8996')
    for yy in range(63,73,3):R(47,yy,10,1,'#344756')
   else:
    R(54,42+dy,13,13,'#456171');R(55,42+dy,11,3,'#bdd0c8');R(67,46+dy,10,6,'#a8bfc1');R(76,48+dy,3,2,'#e1e7d4')
    for xx in range(68,77,3):R(xx,46+dy,1,6,'#344855')
  if state=='jetpack':
   R(9,57,10,5,'#fff5c1');R(11,62,7,7+f*2,'#ffb65c');R(13,69,3,5+f,'#e56a45')
  if state=='fuel-out':R(25,29,28,3,'#7e6653')
  save(f'miner/{state}/frame{f:02}.png',a,sheet=True)
# Camp art, 240x160 industrial structures.
for k,name in enumerate(['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']):
 a=[];rect(a,8,149,224,11,'#172937');rect(a,13,144,214,5,'#6d838b')
 if k==0:
  for x in (30,108):
   rect(a,x,45,55,97,'#172c3b');rect(a,x+4,43,47,94,'#587c86');rect(a,x+9,48,12,87,'#9bb7b4');rect(a,x+1,60,53,9,'#c29754');rect(a,x+1,111,53,8,'#223e51');rect(a,x+20,29,12,15,'#8aa5a7')
  rect(a,176,90,29,54,'#bd8050');rect(a,179,96,23,17,'#152f40');rect(a,183,100,15,7,'#8ae0cd');line(a,205,103,219,116,'#b5c2ad');line(a,219,116,219,140,'#b5c2ad')
 elif k==1:
  rect(a,23,66,191,78,'#334d5e');rect(a,20,58,196,15,'#af8a5a');rect(a,37,80,84,52,'#142b3b');rect(a,42,84,73,34,'#8ab8b6');rect(a,128,91,69,53,'#1c3445')
  for x in range(136,194,17):rect(a,x,106,12,26,'#b88055');line(a,x,106,x+12,132,'#edba78')
 elif k==2:
  rect(a,36,131,168,12,'#567f88');rect(a,66,122,108,9,'#89d4cc');rect(a,109,35,22,87,'#4b7183');rect(a,94,25,53,53,'#1b3448');rect(a,99,30,43,43,'#68b6b4');rect(a,107,38,27,27,'#152e41');rect(a,112,42,17,5,'#c8f2d8');rect(a,113,52,13,9,'#b7d8c8')
 elif k in (3,4):
  rect(a,22,63,198,81,'#385364');rect(a,17,56,208,13,'#728e94');rect(a,31,42,93,14,'#243b4e');rect(a,39,44,74,9,'#b1cfbd');rect(a,39,79,48,65,'#142b3d');rect(a,45,85,36,37,'#649a9e');rect(a,104,78,100,54,'#152f40')
  for x in range(111,198,17):
   rect(a,x,85,10,13,'#d4a163' if k==3 else '#7ec8bb');rect(a,x,110,10,13,'#859e9d')
  if k==3:rect(a,178,17,12,39,'#71929b');rect(a,170,20,29,9,'#71929b')
 else:
  rect(a,33,126,174,18,'#3f6270');rect(a,37,128,166,4,'#abc4bc');rect(a,45,22,13,104,'#5b7983')
  for y in range(27,126,22):line(a,45,y,58,y+20,'#bd955b')
 # Consistent battered metal, riveted trim and facility emblems.
 for x in range(20,220,24):
  rect(a,x,148,2,2,'#b8c6b5');rect(a,x,151,2,2,'#102637')
 if k in (1,3,4):
  for x in range(28,218,13):rect(a,x,63,7,2,'#a8b8af')
  for x in range(101,211,23):line(a,x,136,x+8,136,'#78969b')
  rect(a,27,76,4,58,'#65818b');rect(a,211,76,4,58,'#203b50')
 if k==0:
  for x in (30,108):
   for yy in range(-6,7):
    ww=int(23*math.sqrt(max(0,1-(yy/7)**2)));rect(a,x+27-ww,44+yy,ww*2,1,'#9fb5b1' if yy<0 else '#6c8a92')
   for y in (74,125):rect(a,x+3,y,3,3,'#becbbb');rect(a,x+49,y,3,3,'#243e51')
   rect(a,x+28,77,14,26,'#254353');rect(a,x+31,82,8,3,'#e4bc75');rect(a,x+31,89,8,9,'#e4bc75')
  line(a,83,132,111,132,'#8fa7a8');line(a,83,133,111,133,'#8fa7a8')
 if k==1:
  for x in range(40,110,12):rect(a,x,91,4,8,'#d1d2aa')
  rect(a,126,76,59,7,'#9bb5b0');rect(a,139,62,30,12,'#c59e63');rect(a,145,58,18,5,'#e3c68b')
 if k==3:
  circle(a,151,105,15,'#a9c6bf');circle(a,151,105,10,'#38586a');rect(a,148,87,6,35,'#a9c6bf');rect(a,134,102,35,6,'#a9c6bf');circle(a,151,105,5,'#213f53')
 if k==4:
  rect(a,131,91,40,31,'#b99560');rect(a,133,93,36,3,'#ecd298');line(a,134,97,168,118,'#efd394');line(a,168,97,134,118,'#efd394')
 save(f'surface/{name}.png',a,240,160)
# Sky: distant moon, dust stars, ridged industrial horizon.
a=[];rect(a,0,0,1280,480,'#111f2d')
for y in range(480):rect(a,0,y,1280,1,shade('#233e4c',.45+.55*y/480))
for i in range(170):
 x=random.randrange(1280);y=random.randrange(370);rect(a,x,y,1 if i%5 else 2,1,'#73959a' if i%3 else '#a3bbb4')
circle(a,1010,132,62,'#597578');circle(a,1030,120,58,'#284552')
for x in range(1280):
 h=int(28+17*math.sin(x*.008)+12*math.sin(x*.03));rect(a,x,480-h,1,h,'#172b39')
save('surface/sky.png',a,1280,480)
a=[];rect(a,0,0,80,16,'#7c8171');rect(a,0,3,80,4,'#c2b68b')
for i in range(80):rect(a,random.randrange(80),random.randrange(8,16),3,1,'#384957')
save('surface/ground.png',a)
a=[];circle(a,40,42,37,'#304a59');circle(a,40,48,28,'#0d1b29');rect(a,12,48,56,32,'#0d1b29')
for x in (7,65):rect(a,x,33,8,47,'#ae8d58');rect(a,x,35,4,10,'#e7c573')
save('surface/cave-mouth.png',a)
for n in range(6):
 a=[];rect(a,12,224,136,16,'#233e50');rect(a,8,220,144,5,'#9ab1ae');rect(a,24,215,112,5,'#c09c64')
 if n:
  rect(a,52,94,56,121,'#172b3b');rect(a,56,94,48,119,'#9bb7bb');rect(a,60,94,11,119,'#d5e1cd');rect(a,96,94,8,119,'#5b8191')
  for y in (125,168,198):rect(a,56,y,48,4,'#456578')
 if n>=2:rect(a,71,133,19,53,'#ca985d');rect(a,73,135,4,48,'#f0cb7b')
 if n>=3:
  for y in range(43,94):
   w=int((y-42)*.46);rect(a,80-w,y,w*2,1,'#bfcebf');rect(a,80-w,y,max(1,w//3),1,'#e6e9cf')
  circle(a,80,107,13,'#223f54');circle(a,80,105,9,'#72d9d3');circle(a,77,102,4,'#dcf4db')
 if n>=4:
  for x in (35,106):rect(a,x,178,19,37,'#ae7f54');rect(a,x+3,182,5,25,'#e7b467')
  rect(a,65,208,30,11,'#243f51')
 if n==5:rect(a,74,194,12,8,'#f5c76b');rect(a,56,155,48,6,'#df9c5d')
 save(f'rocket/stage{n}.png',a,160,240)
for k,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
 a=[];c=['#e9ba73','#92d9bd','#a6c7d1','#f4d58c','#a4c1cd','#a5e9b9','#8bdafa','#ffb66c'][k]
 if k==0:rect(a,5,6,13,16,c);rect(a,8,2,7,4,c);rect(a,9,10,5,7,'#243d4f')
 elif k==1:
  for y in range(3,21):
   w=8 if y<13 else 8-(y-13);rect(a,12-w,y,w*2,1,c)
  rect(a,10,7,4,9,'#244252');rect(a,7,10,10,3,'#244252')
 elif k==2:rect(a,3,7,18,14,c);rect(a,6,3,12,4,c);rect(a,5,10,14,2,'#244252');rect(a,10,13,4,8,'#244252')
 elif k==3:circle(a,12,12,10,c);circle(a,12,12,7,'#284354');rect(a,9,5,3,14,c);rect(a,8,7,9,2,c);rect(a,8,15,9,2,c)
 elif k==4:rect(a,10,2,4,13,c);line(a,5,12,12,20,c);line(a,19,12,12,20,c)
 else:
  for y in range(3,22):
   w=max(1,8-abs(y-11)//2);rect(a,12-w,y,2*w,1,c)
  rect(a,9,7,3,11,'#e9fff1');line(a,12,3,19,11,'#ffffff')
 save(f'icons/{name}.png',a,24,24)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for r in pool.map(lambda cmd:subprocess.run(cmd,capture_output=True),jobs):
  if r.returncode:raise RuntimeError(r.stderr.decode())
print('Rasterized',len(jobs),'authored sprites and frames')
