"""Render an explicitly labeled synthetic diagram; requires Pillow. No real phone footage."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
frames=json.loads(Path(sys.argv[1]).read_text())
output=Path(sys.argv[2]); output.parent.mkdir(parents=True,exist_ok=True)
font_candidates=['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
font_path=next((p for p in font_candidates if Path(p).exists()),None)
def font(size): return ImageFont.truetype(font_path,size) if font_path else ImageFont.load_default(size=size)
colors={'NONE':'#5dd6a2','LOW':'#f3d16b','MODERATE':'#f6a35b','HIGH':'#fa6b70','CRITICAL':'#fb4661'}
images=[]
for frame in frames:
 im=Image.new('RGB',(900,520),'#101827'); d=ImageDraw.Draw(im)
 d.text((30,22),'SAFETY ALERT SYSTEM',fill='#f2f6ff',font=font(28))
 d.text((30,62),'SYNTHETIC DEMO  /  No physical phones or real GPS',fill='#98b7d7',font=font(16))
 label='Head-on approach' if frame['scenario']=='head-on' else 'Quiet wide pass: 25 m lateral separation'
 d.text((30,108),label,fill='#eef4ff',font=font(22))
 d.text((30,143),f"t = {frame['seconds']:02.0f} s   |   walktest profile   |   1 Hz evaluation",fill='#a4b5cd',font=font(15))
 box=(30,184,605,465); d.rounded_rectangle(box,12,fill='#19263a')
 for x in range(70,605,60): d.line((x,190,x,459),fill='#26364b')
 for y in range(210,460,50): d.line((36,y,599,y),fill='#26364b')
 def xy(p): return (318+p['x']*7,390-p['y']*7)
 a,b=xy(frame['a']),xy(frame['b'])
 d.line((*a,*b),fill=colors[frame['shown']],width=3)
 for point,color,label,direction in [(a,'#75baff','A',1),(b,'#e7b3fa','B',-1)]:
  x,y=point; d.ellipse((x-10,y-10,x+10,y+10),fill=color)
  d.text((x-5,y-35),label,fill='#ffffff',font=font(18)); d.line((x,y,x+direction*25,y),fill=color,width=3)
 d.text((45,439),'Local meters; fictional origin; arrows show direction',fill='#8da4bf',font=font(13))
 d.text((635,193),'SHOWN ALERT',fill='#a4b5cd',font=font(16))
 d.text((635,222),frame['shown'],fill=colors[frame['shown']],font=font(29))
 d.text((635,279),f"Raw: {frame['raw']}",fill='#dae6f4',font=font(18))
 d.text((635,313),f"Risk: {frame['risk']:.2f}",fill='#dae6f4',font=font(18))
 d.text((635,347),f"Distance: {frame['distanceM']:.1f} m",fill='#dae6f4',font=font(18))
 d.text((635,381),f"TCPA: {frame['tcpaS']:.1f} s",fill='#dae6f4',font=font(18))
 d.text((30,488),'Deterministic model + two-tick debounce. Simulation results do not establish real-world safety.',fill='#91a9c4',font=font(14))
 images.append(im)
images[0].save(output,save_all=True,append_images=images[1:],duration=1000,loop=0,optimize=True)
if len(sys.argv)>3:
 preview=Path(sys.argv[3]); preview.mkdir(parents=True,exist_ok=True)
 for i in [0,11,40]: images[i].save(preview/f'frame-{i}.png')
print(f'Saved {len(images)}-frame, {len(images)}-second synthetic animation: {output}')
