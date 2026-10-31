import React, { useEffect, useRef, useState } from 'react';
import { Download, RotateCw, FlipHorizontal, RefreshCcw, Save } from 'lucide-react';
import { downloadBlob, saveAsset } from './db';

export default function ImageEditor({ file, onSave, notify }) {
  const canvas = useRef(null);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotate, setRotate] = useState(0);
  const [mirror, setMirror] = useState(false);
  useEffect(() => {
    if (!file || !canvas.current) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const el = canvas.current; if (!el) return;
      const quarter = rotate % 180 !== 0;
      const w = Math.min(image.naturalWidth, 1400);
      const h = Math.round(image.naturalHeight * w / image.naturalWidth);
      el.width = quarter ? h : w; el.height = quarter ? w : h;
      const ctx = el.getContext('2d');
      ctx.save();
      ctx.translate(el.width / 2, el.height / 2);
      ctx.rotate(rotate * Math.PI / 180);
      ctx.scale(mirror ? -1 : 1, 1);
      ctx.filter = 'brightness(' + bright + '%) contrast(' + contrast + '%) saturate(' + saturation + '%)';
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, bright, contrast, saturation, rotate, mirror]);
  function output() {
    return new Promise(resolve => canvas.current.toBlob(resolve, 'image/png', 0.95));
  }
  if (!file) return <div className="empty-panel">เลือกภาพจากคลังไฟล์เพื่อแก้ไข</div>;
  return <div className="editor-layout">
    <div className="editor-preview"><canvas ref={canvas} /></div>
    <div className="editor-controls">
      <p className="eyebrow">LOCAL IMAGE TOOLS · ฟรี</p><h3>ปรับแต่งภาพ</h3>
      {[['ความสว่าง', bright, setBright], ['คอนทราสต์', contrast, setContrast], ['ความอิ่มสี', saturation, setSaturation]].map(([label, value, fn]) =>
        <label className="range-label" key={label}>{label}<span>{value}%</span><input type="range" min="0" max="200" value={value} onChange={e => fn(+e.target.value)} /></label>)}
      <div className="row wrap"><button className="btn ghost" onClick={() => setRotate((rotate + 90) % 360)}><RotateCw size={16} /> หมุน</button>
      <button className="btn ghost" onClick={() => setMirror(!mirror)}><FlipHorizontal size={16} /> กลับภาพ</button>
      <button className="btn ghost" onClick={() => { setBright(100); setContrast(100); setSaturation(100); setRotate(0); setMirror(false); }}><RefreshCcw size={16} /> คืนค่า</button></div>
      <div className="row wrap"><button className="btn primary" onClick={async () => { const blob = await output(); if (!blob) return; await saveAsset(new File([blob], 'edited-' + file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' })); notify('บันทึกภาพลงคลังแล้ว'); onSave(); }}><Save size={16}/> บันทึกเข้าคลัง</button>
      <button className="btn secondary" onClick={async () => { const blob = await output(); if (blob) downloadBlob(blob, 'edited-image.png'); }}><Download size={16}/> ดาวน์โหลด</button></div>
    </div>
  </div>;
}
