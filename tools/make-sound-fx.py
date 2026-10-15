import json, pathlib, subprocess
R=pathlib.Path('/work');D=R/'tools'/'recipes';D.mkdir(exist_ok=True)
def config(name,kind):
 p=D/(name+'.json');a=str(D/(name+'.ops.json'));pr=str(D/(name+'.png'))
 if kind=='particle-2d':v=dict(width=400,height=400,duration_ms=1800,fps=24,seed=82,actions=a,preview=pr,system=str(R/'assets/fx'/(name+'.json')))
 else:v=dict(sample_rate=22050,channels='mono',max_duration_ms=3000,seed=42,actions=a,preview=pr,wav=str(R/'assets/audio'/(name+'.wav')),sample_pack='combat-core')
 p.write_text(json.dumps(v));return p
def run(tool,c,*args):
 p=subprocess.run([tool,'--config',str(c),*map(str,args)],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode())
fx=[('gas-seep','#b3d8bd',8,35,.17),('drill-debris','#dfad7e',22,140,.8),('jetpack-exhaust','#ffc06b',24,160,.9),('ore-sparkle','#e8f1be',24,100,.9),('material-shimmer','#a0efd8',45,100,.85),('gas-explosion','#ff9a62',100,240,1),('lava-embers','#ffb05e',24,140,.8),('impact-dust','#a6aa9c',30,100,.5),('core-extract','#ffcf83',60,160,.9),('core-detonation','#ffdba4',180,380,1),('launch-exhaust','#f9bf73',90,200,.8),('death-burst','#cce2d1',70,150,.8)]
for name,col,count,speed,alpha in fx:
 c=config(name,'particle-2d');run('particle-2d',c,'init')
 down=name in ['jetpack-exhaust','launch-exhaust'];seep=name=='gas-seep'
 run('particle-2d',c,'add-emitter','--name','main','--shape','edge' if seep else 'point','--size-x',60 if seep else 1,'--x',200,'--y',200,'--burst',count,'--lifetime',1200 if seep else 700,'--lifetime-spread',200,'--speed',speed,'--speed-spread',speed*.4,'--dir-y',-1 if down else 1,'--cone-angle',18 if down else (30 if seep else 360 if name in ['gas-explosion','core-detonation','death-burst','ore-sparkle','material-shimmer','core-extract'] else 180))
 run('particle-2d',c,'set-particle','--emitter','main','--size-from',3 if seep else 1.2,'--size-to',5 if seep else .1,'--opacity-from',alpha,'--opacity-to',0,'--color-gradient',col+'@0,#5d7181@1','--stretch',2)
 run('particle-2d',c,'set-forces','--gravity',0 if seep else 80,'--drag',1.4,'--turbulence','10,0.02')
 if 'explosion' in name or name=='core-detonation':
  for part,num,sp,sz in [('flash',1,0,10),('shell',60,speed*1.3,1.8)]:
   run('particle-2d',c,'add-emitter','--name',part,'--shape','point','--x',200,'--y',200,'--burst',num,'--lifetime',180 if part=='flash' else 400,'--speed',sp,'--cone-angle',360)
   run('particle-2d',c,'set-particle','--emitter',part,'--size-from',sz,'--size-to',.1,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff5ca@0,#f39b62@1')
 run('particle-2d',c,'render','--frame',8)
# Textured machine cues and small tonal rewards.
for name,sample,freq in [('drill','engine_diesel_idle',95),('thrust','whoosh_air',65),('ore-pickup','mech_clip_load',740),('material-chime','zap_electric',520),('gas-explosion','cannon_body_heavy',55),('lava-sizzle','fire_crackle',190),('impact','impact_metal_dry',100),('fabricate','mech_clank',440),('launch','boom_sub_rumble',45),('death','debris_rubble',70),('alarm-fuel',None,440),('alarm-core',None,660)]:
 tool='sfx-sample' if sample else 'sfx-synth';c=config(name,tool);run(tool,c,'init');dur=1000 if name in ['drill','thrust','launch'] else 500
 if sample:run(tool,c,'add-sample','--name',sample,'--t',0,'--gain',-19 if name in ['drill','thrust'] else -11,'--trim','0,'+str(dur),'--fade-out',60)
 for i in range(2 if name in ['ore-pickup','material-chime','fabricate'] else 1):
  run(tool,c,'add-voice','--name','tone'+str(i),'--wave','triangle' if freq>200 else 'saw','--freq',freq*(1.5**i),'--gain',-24 if freq<200 else -19,'--start',i*85,'--dur',dur if freq<200 else 180)
  run(tool,c,'set-envelope','--voice','tone'+str(i),'--env','gate' if name in ['drill','thrust'] else 'pluck')
 run(tool,c,'render')
c=config('music','music');v=json.loads(c.read_text());v.update(max_duration_ms=32000,mid=str(R/'assets/audio/music.mid'),instrument_bank='gm-lite');c.write_text(json.dumps(v))
run('music',c,'init');run('music',c,'set-tempo','--bpm',72)
for tr,inst,gain in [('floor','sine',-25),('pulse','triangle',-30),('air','sine',-31)]:
 run('music',c,'define-track','--name',tr,'--instrument',inst);run('music',c,'set-track-fx','--track',tr,'--gain',gain,'--reverb',.4,'--env','swell' if tr!='pulse' else 'pluck')
for i,pitch in enumerate([38,38,34,36]):
 run('music',c,'add-note','--track','floor','--pitch',pitch,'--t',i*8,'--dur',8,'--velocity',65)
 run('music',c,'add-note','--track','air','--pitch',pitch+31,'--t',i*8+1,'--dur',6,'--velocity',45)
 for j in range(8):run('music',c,'add-note','--track','pulse','--pitch',pitch+12+[0,7,12,7][j%4],'--t',i*8+j,'--dur',.6,'--velocity',55)
run('music',c,'render');print('Produced 12 live effects, 12 cues and descent score')
