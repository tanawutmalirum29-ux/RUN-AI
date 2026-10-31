import React, { useEffect, useRef, useState } from 'react';
import {
  Aperture, ArrowRight, AudioLines, BadgeCheck, BookOpen, Check, ChevronRight,
  CircleHelp, Cloud, Code2, Download, File, FileImage, FileText, Film, FolderOpen,
  Image as ImageIcon, Layers3, LoaderCircle, Menu, MessageSquare, Mic, Monitor,
  Play, Plus, RefreshCw, Send, Settings2, Shield, SlidersHorizontal, Sparkles,
  SquarePen, Trash2, Upload, WandSparkles, Wifi, WifiOff, X
} from 'lucide-react';
import { cloudConfigured, runCloud } from './service';
import { deleteAsset, downloadBlob, listAssets, photoBytes, saveAsset } from './db';
import ImageEditor from './ImageEditor';
import { buildConversation } from '../shared/chat-history.mjs';

const sections = [
  { id: 'home', title: 'ภาพรวม', icon: Layers3 },
  { id: 'chat', title: 'AI Chat', icon: MessageSquare },
  { id: 'image', title: 'สร้างภาพ', icon: ImageIcon },
  { id: 'video', title: 'สร้างวิดีโอ', icon: Film },
  { id: 'files', title: 'คลังไฟล์', icon: FolderOpen },
  { id: 'editor', title: 'แต่งภาพ', icon: SlidersHorizontal },
  { id: 'settings', title: 'ตั้งค่าระบบ', icon: Settings2 },
];
const starters = ['ช่วยวางแผนสร้างเกมของฉัน', 'เขียน JSON เนื้อเรื่องอนิเมชัน', 'ช่วยตรวจโค้ด JavaScript', 'คิดพรอมต์สร้างภาพแฟนตาซี'];
const initialMessages = [{ role: 'assistant', text: 'สวัสดี ยินดีต้อนรับสู่ RUN AI\nเลือก Browser AI เพื่อรันโมเดลภายในเครื่อง หรือ AWS AI เพื่อใช้ Amazon Bedrock หลังตั้งค่า Cloud Backend', time: Date.now() }];
function assetIcon(type) {
  if (type?.startsWith('image/')) return FileImage;
  if (type?.startsWith('video/')) return Film;
  return FileText;
}
const formatSize = size => size > 1024 * 1024 ? (size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' KB';
function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function AssetThumb({ item }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!item.file?.type?.startsWith('image/')) return;
    const created = URL.createObjectURL(item.file); setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [item]);
  const Icon = assetIcon(item.type);
  return url ? <img className="asset-thumb" src={url} alt={item.name}/> : <span className="asset-placeholder"><Icon size={26}/></span>;
}
function PromptInput({ value, onChange, placeholder, rows = 5 }) {
  return <textarea className="prompt-input" rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>;
}

export default function App({ user, signOut }) {
  const [page, setPage] = useState('chat');
  const [navOpen, setNavOpen] = useState(false);
  const [mode, setMode] = useState(stored('run-ai-mode', 'browser'));
  const [messages, setMessages] = useState(stored('run-ai-chat', initialMessages).slice(-30));
  const [chatText, setChatText] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageNegative, setImageNegative] = useState('');
  const [imageAspect, setImageAspect] = useState('1:1');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [duration, setDuration] = useState('5s');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [videoJob, setVideoJob] = useState(stored('run-ai-video-job', null));
  const [busy, setBusy] = useState('');
  const [alert, setAlert] = useState('');
  const [assets, setAssets] = useState([]);
  const [reload, setReload] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cloudStatus, setCloudStatus] = useState(null);
  const [browserProgress, setBrowserProgress] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const fileRef = useRef(null);
  const engine = useRef(null);
  const chatEnd = useRef(null);

  const notify = text => setAlert(text);
  useEffect(() => { const t = setTimeout(() => setAlert(''), 4800); return () => clearTimeout(t); }, [alert]);
  useEffect(() => { localStorage.setItem('run-ai-mode', JSON.stringify(mode)); }, [mode]);
  useEffect(() => { localStorage.setItem('run-ai-chat', JSON.stringify(messages.slice(-30))); }, [messages]);
  useEffect(() => { if (videoJob) localStorage.setItem('run-ai-video-job', JSON.stringify(videoJob)); }, [videoJob]);
  useEffect(() => { listAssets().then(x => setAssets(x.sort((a,b) => b.created - a.created))).catch(() => notify('เบราว์เซอร์ไม่อนุญาตให้เปิดคลังไฟล์')); }, [reload]);
  useEffect(() => { if (cloudConfigured) runCloud('status').then(setCloudStatus).catch(e => setCloudStatus({ error: e.message })); }, []);
  useEffect(() => { if (page === 'chat') chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, page]);

  const cloudReady = Boolean(cloudStatus?.configured);
  function openPage(id) { setPage(id); setNavOpen(false); }
  function startUpload(target = page) {
    setPage(target);
    setTimeout(() => fileRef.current?.click(), 0);
  }
  async function uploadFiles(inputFiles) {
    const list = Array.from(inputFiles || []);
    for (const file of list) {
      if (file.size > 40 * 1048576) { notify('ไฟล์ใหญ่เกิน 40 MB: ' + file.name); continue; }
      try {
        await saveAsset(file);
        if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('text/') || /\.(json|txt|md)$/i.test(file.name)) setAttachment(file);
      } catch { notify('จัดเก็บไฟล์นี้ไม่ได้ อาจมีพื้นที่ในอุปกรณ์ไม่เพียงพอ'); }
    }
    if (list.length) { setReload(x => x + 1); notify('บันทึกไฟล์ในเบราว์เซอร์แล้ว (ยังไม่ได้อัปโหลดขึ้น AWS)'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function loadEngine() {
    if (engine.current) return engine.current;
    if (!navigator.gpu) throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebGPU — ให้ใช้ Chrome เวอร์ชันใหม่บนอุปกรณ์ที่มี GPU หรือเลือก AWS AI');
    setBrowserProgress('กำลังโหลดระบบ WebLLM...');
    const webllm = await import('@mlc-ai/web-llm');
    const model = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    if (!webllm.prebuiltAppConfig.model_list.some(m => m.model_id === model)) throw new Error('ไม่พบโมเดลตัวอย่างใน WebLLM เวอร์ชันนี้');
    const result = await webllm.CreateMLCEngine(model, { initProgressCallback: e => setBrowserProgress(e.text || 'กำลังดาวน์โหลดโมเดล...') });
    engine.current = result;
    setBrowserProgress('ดาวน์โหลดโมเดลสำเร็จ');
    return result;
  }
  async function sendChat(text = chatText) {
    if (busy) return;
    if (!text.trim() && !attachment) return;
    let prompt = text.trim() || (attachment?.type.startsWith('image/') ? 'วิเคราะห์ภาพนี้ให้หน่อย' : 'ช่วยตรวจไฟล์ที่แนบ');
    // Shared, valid history for both Browser AI and AWS Bedrock.
    const prior = messages.filter(x => (x.role === 'user' || x.role === 'assistant') && !x.error && typeof x.text === 'string').slice(-20);
    while (prior.length && prior[0].role !== 'user') prior.shift();
    const attachmentName = attachment?.name || '';
    const newMessage = { role: 'user', text: prompt + (attachmentName ? '\n📎 ' + attachmentName : ''), time: Date.now() };
    setMessages(x => [...x, newMessage]);
    setChatText('');
    const file = attachment; setAttachment(null);
    setBusy('chat');
    try {
      let answer;
      let textFile = '';
      if (file && /\.(txt|json|md|csv)$/i.test(file.name)) textFile = '\n\n[เนื้อหาไฟล์ ' + file.name + ']\n' + (await file.text()).slice(0, 10000);
      if (file?.type === 'application/pdf') throw new Error('ขณะนี้ไฟล์ PDF เก็บในคลังได้ แต่ยังไม่มีตัวอ่าน PDF สำหรับ AI กรุณาแปลงเป็น TXT ก่อน');
      if (mode === 'browser') {
        if (file?.type.startsWith('image/') || file?.type.startsWith('video/')) throw new Error('Browser AI รุ่นทดลองเป็นโมเดลข้อความเท่านั้น ภาพและเฟรมวิดีโอต้องเลือก AWS AI');
        const local = await loadEngine();
        const chatMessages = buildConversation(prior, prompt + textFile, {
          maxHistoryMessages: 10, maxCharsPerHistoryMessage: 3000,
        });
        const out = await local.chat.completions.create({
          messages: chatMessages, temperature: 0.6, max_tokens: 600,
        });
        answer = out.choices?.[0]?.message?.content || 'ไม่พบข้อความตอบกลับ';
      } else {
        const image = file && (file.type.startsWith('image/') || file.type.startsWith('video/')) ? await photoBytes(file) : '';
        const res = await runCloud('chat', { prompt: prompt + textFile, history: prior, image });
        answer = res.text;
      }
      setMessages(x => [...x, { role: 'assistant', text: String(answer), time: Date.now() }]);
    } catch (e) {
      setMessages(x => [...x, { role: 'assistant', text: 'ไม่สำเร็จ: ' + e.message, error: true, time: Date.now() }]);
    } finally { setBusy(''); }
  }
  async function generateImage() {
    if (busy || !imagePrompt.trim()) return;
    setBusy('image'); setGeneratedImage(null);
    try {
      const res = await runCloud('image', { prompt: imagePrompt.trim(), negative: imageNegative.trim(), aspect: imageAspect });
      setGeneratedImage(res); notify('สร้างภาพสำเร็จ คุณสามารถเปิดหรือดาวน์โหลดไฟล์ได้');
    } catch(e) { notify('สร้างภาพไม่สำเร็จ: ' + e.message); } finally { setBusy(''); }
  }
  async function startVideo() {
    if (busy || !videoPrompt.trim()) return;
    setBusy('video');
    try {
      const image = attachment?.type.startsWith('image/') ? await photoBytes(attachment) : '';
      const job = await runCloud('video-start', { prompt: videoPrompt.trim(), aspect: videoAspect, duration, image });
      setVideoJob(job);
      setAttachment(null);
      notify('ส่งงานสร้างวิดีโอแล้ว กรุณาตรวจสถานะ');
    } catch(e) { notify('สร้างวิดีโอไม่สำเร็จ: ' + e.message); } finally { setBusy(''); }
  }
  async function refreshVideo() {
    if (!videoJob?.jobId) return;
    try {
      const res = await runCloud('video-status', { jobId: videoJob.jobId });
      setVideoJob(old => ({ ...old, ...res }));
    } catch(e) { notify(e.message); }
  }
  useEffect(() => {
    if (!cloudConfigured || !videoJob?.jobId || ['Failed','Completed'].includes(videoJob.status)) return;
    const t = setInterval(refreshVideo, 16000);
    return () => clearInterval(t);
  }, [videoJob?.jobId, videoJob?.status]);
  function recordVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { notify('เบราว์เซอร์นี้ไม่รองรับการพูดเป็นข้อความ'); return; }
    const recognition = new Recognition();
    recognition.lang = 'th-TH'; recognition.onresult = e => setChatText(t => t + e.results[0][0].transcript);
    recognition.onend = () => setMicActive(false);
    recognition.onerror = () => { setMicActive(false); notify('ไม่สามารถเปิดไมโครโฟนได้'); };
    setMicActive(true); recognition.start();
  }
  function clearChat() { if (!window.confirm('ล้างบทสนทนาบนอุปกรณ์นี้?')) return; setMessages(initialMessages); }
  function onDrop(e) { e.preventDefault(); setDropOver(false); uploadFiles(e.dataTransfer.files); }
  const current = sections.find(x => x.id === page) || sections[0];

  return <div className={'app-layout ' + (dropOver ? 'drag-over' : '')} onDragOver={e => { e.preventDefault(); setDropOver(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOver(false); }} onDrop={onDrop}>
    <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,audio/*,.txt,.json,.md,.csv,.pdf" onChange={e => uploadFiles(e.target.files)} />
    <aside className={'sidebar ' + (navOpen ? 'mobile-open' : '')}>
      <button className="brand" onClick={() => openPage('home')}>
        <span className="brand-glyph"><Aperture size={23}/></span>
        <span><strong>RUN<span>AI</span></strong><small>EXPERIMENTAL STUDIO</small></span>
      </button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{sections.map(({id,title,icon:Icon}) => <button key={id} className={'nav-item ' + (page === id ? 'selected' : '')} onClick={() => openPage(id)}><Icon size={19}/><span>{title}</span>{page === id && <span className="selected-indicator"/>}</button>)}</nav>
      <div className="side-bottom">
        <div className="side-status">
          <span className={'status-dot ' + (cloudReady ? 'green' : 'amber')}/>
          <span><strong>{cloudReady ? 'Cloud AI พร้อมใช้งาน' : 'โหมดทดลอง'}</strong><small>{cloudConfigured ? 'AWS Amplify connected' : 'Frontend only · Local tools'}</small></span>
        </div>
        <div className="side-note"><Shield size={16}/> คีย์ AWS ไม่ถูกส่งไปที่เบราว์เซอร์</div>
        <button className="side-github" onClick={() => window.open('https://github.com/tanawutmalirum29-ux/RUN-AI','_blank','noopener,noreferrer')}>GitHub Repository <ArrowRight size={15}/></button>
      </div>
    </aside>
    {navOpen && <button className="nav-scrim" aria-label="ปิดเมนู" onClick={() => setNavOpen(false)}/>}
    <main className="main">
      <header className="topbar">
        <div className="top-left"><button className="mobile-menu icon-button" onClick={() => setNavOpen(true)} aria-label="เมนู"><Menu size={21}/></button><span className="breadcrumb">WORKSPACE</span><ChevronRight size={14}/><span className="crumb-strong">{current.title}</span></div>
        <div className="top-right"><span className={'top-chip ' + (cloudReady ? 'good':'') }><span className={'status-dot ' + (cloudReady ? 'green':'amber')}/>{cloudReady ? 'AWS AI READY' : cloudConfigured ? 'AWS CONNECTED' : 'LOCAL PREVIEW'}</span><button className="icon-button" title="อัปโหลดไฟล์" onClick={() => startUpload('files')}><Upload size={19}/></button><div className="avatar">AI</div></div>
      </header>
      <div className="content" key={page}>
        {page === 'home' && <>
          <div className="welcome-hero"><div className="hero-copy"><span className="eyebrow with-dot"><span/> YOUR CREATIVE LAB</span><h1>พื้นที่ทดลอง<br/><em>AI ไม่มีขีดจำกัดด้านไอเดีย</em></h1><p>แชต สร้างภาพ วิดีโอ และทำงานกับไฟล์ในที่เดียว — เลือกรัน AI บนอุปกรณ์ หรือเชื่อม AWS Bedrock สำหรับงานที่หนักขึ้น</p><div className="row wrap"><button className="btn primary" onClick={() => openPage('chat')}><Sparkles size={16}/> เริ่มทดลอง AI <ArrowRight size={16}/></button><button className="btn secondary" onClick={() => startUpload('files')}><Upload size={16}/> เพิ่มไฟล์ของคุณ</button></div></div><div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="hero-center"><Aperture size={85} strokeWidth={1.1}/></div><div className="mini-tag a">TEXT / VISION</div><div className="mini-tag b">IMAGE / VIDEO</div></div></div>
          <div className="section-head"><div><p className="eyebrow">TOOLS</p><h2>เริ่มทำอะไรดี?</h2></div><span className="subtle">คลิกเพื่อเปิดเครื่องมือ</span></div>
          <div className="tool-grid">{[
            {id:'chat',icon:MessageSquare,title:'AI Conversation',detail:'ถามตอบ เขียนโค้ด และวิเคราะห์รูป',mark:'Browser + AWS',cls:'violet'},
            {id:'image',icon:ImageIcon,title:'Image Generation',detail:'เปลี่ยนคำบรรยายให้เป็นภาพ',mark:'AWS AI',cls:'pink'},
            {id:'video',icon:Film,title:'Video Studio',detail:'สร้างวิดีโอจากข้อความหรือรูป',mark:'AWS AI',cls:'blue'},
            {id:'files',icon:FolderOpen,title:'File Workspace',detail:'เก็บ ดู และดาวน์โหลดไฟล์',mark:'Local · ฟรี',cls:'green'},
          ].map(({id,icon:Icon,title,detail,mark,cls}) => <button key={id} className="tool-card" onClick={() => openPage(id)}><span className={'tool-icon '+cls}><Icon size={23}/></span><ChevronRight className="card-arrow" size={18}/><strong>{title}</strong><small>{detail}</small><span className="tool-mark">{mark}</span></button>)}</div>
          <div className="info-strip"><CircleHelp size={20}/><span><strong>ทดลองฟรีได้ทันที:</strong> Browser AI (ต้องรองรับ WebGPU และดาวน์โหลดโมเดล), แต่งภาพ และคลังไฟล์ ส่วน AI สร้างภาพและวิดีโอจะใช้งานได้หลังเปิด AWS Bedrock</span><button onClick={() => openPage('settings')}>ดูการตั้งค่า <ArrowRight size={15}/></button></div>
        </>}
        {page === 'chat' && <div className="chat-page">
          <div className="section-head chat-heading"><div><p className="eyebrow">INTELLIGENCE / CHAT</p><h1>AI Conversation <span className="title-sparkle">✦</span></h1><p className="subtle">ถามเรื่องอะไรก็ได้ ส่งภาพให้วิเคราะห์ หรือส่งไฟล์ข้อความประกอบ</p></div><button className="btn ghost small" onClick={clearChat}><SquarePen size={16}/> เริ่มแชตใหม่</button></div>
          <div className="chat-toolbar"><div className="tabs">{[['browser','Browser AI · ฟรี'],['cloud','AWS Bedrock']].map(([v,t]) => <button key={v} className={mode===v ? 'active':''} onClick={() => setMode(v)}>{t}</button>)}</div><span className="model-hint">{mode==='browser'?'Qwen2.5 0.5B · WebGPU': 'Nova Lite · Vision'}</span></div>
          {mode==='browser' && <div className="inline-tip"><Monitor size={16}/> โมเดลทำงานบน GPU ของอุปกรณ์และดาวน์โหลดครั้งแรกประมาณ 1 GB; ไม่รองรับภาพ/วิดีโอ และอาจใช้ไม่ได้บนมือถือบางรุ่น</div>}
          <div className="chat-stream">
            {messages.map((m,i) => <div key={i} className={'message ' + (m.role==='user'?'from-user':'from-ai') + (m.error?' is-error':'')}><div className="message-avatar">{m.role === 'user' ? 'YOU' : <Aperture size={17}/>}</div><div className="message-body"><div className="message-meta">{m.role === 'user' ? 'คุณ' : 'RUN AI'} <span>{new Date(m.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="message-text">{m.text}</div>{m.role === 'assistant' && !m.error && <button className="mini-link" onClick={() => { navigator.clipboard?.writeText(m.text); notify('คัดลอกข้อความแล้ว'); }}>คัดลอกข้อความ</button>}</div></div>)}
            {busy==='chat' && <div className="message from-ai"><div className="message-avatar"><Aperture size={17}/></div><div className="message-body"><div className="typing"><span/><span/><span/></div><small className="subtle">{browserProgress || 'กำลังประมวลผลคำตอบ...'}</small></div></div>}
            <div ref={chatEnd}/>
          </div>
          {messages.length < 3 && <div className="suggestions">{starters.map(x => <button key={x} onClick={() => sendChat(x)}>{x} <ArrowRight size={14}/></button>)}</div>}
          <div className="composer">{attachment && <div className="attachment-chip"><File size={15}/><span>{attachment.name}</span><button onClick={() => setAttachment(null)} aria-label="ลบไฟล์"><X size={14}/></button></div>}<textarea rows="2" value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();sendChat();} }} placeholder="พิมพ์ข้อความถึง RUN AI... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"/><div className="composer-bottom"><div className="row"><button className="icon-button" title="แนบรูป วิดีโอ หรือไฟล์" onClick={() => fileRef.current?.click()}><Plus size={20}/></button><button className="icon-button" title="พูดเป็นข้อความ" onClick={recordVoice}><Mic size={19} className={micActive ? 'listening':''}/></button><span className="subtle composer-hint">ไฟล์อยู่ในเครื่องจนกว่าจะส่งไปยัง AI</span></div><button className="send-button" disabled={!!busy || (!chatText.trim() && !attachment)} onClick={() => sendChat()}>{busy==='chat'?<LoaderCircle className="spin" size={19}/>:<Send size={18}/>}</button></div></div>
        </div>}
        {page === 'image' && <><div className="section-head"><div><p className="eyebrow">GENERATIVE / IMAGE</p><h1>Image Studio</h1><p className="subtle">สร้างภาพจริงด้วย Stable Image Core บน Amazon Bedrock</p></div><span className="model-pill"><Sparkles size={15}/> Stable Image Core</span></div>
          <div className="studio-grid"><div className="studio-form"><div className="card-panel"><h3>อธิบายภาพที่ต้องการ</h3><p className="subtle">ยิ่งระบุรายละเอียดชัด ผลลัพธ์ยิ่งตรงกับจินตนาการ</p><PromptInput value={imagePrompt} onChange={setImagePrompt} rows={6} placeholder="ตัวอย่าง: เมืองลอยฟ้าเหนือเมฆในยามเย็น แสงทองส่องผ่านหอคอย สไตล์แฟนตาซี cinematic, highly detailed..."/><label className="field-label">สิ่งที่ไม่ต้องการในภาพ</label><input className="form-input" value={imageNegative} onChange={e=>setImageNegative(e.target.value)} placeholder="blurry, low quality, extra limbs..."/><label className="field-label">อัตราส่วนภาพ</label><div className="choice-row">{['1:1','16:9','9:16','3:2','2:3'].map(v=><button key={v} className={'choice '+(imageAspect===v?'active':'')} onClick={()=>setImageAspect(v)}>{v}</button>)}</div><button className="btn primary full" disabled={!!busy || !imagePrompt.trim()} onClick={generateImage}>{busy==='image'?<LoaderCircle className="spin" size={18}/>:<WandSparkles size={18}/>} สร้างภาพด้วย AI <ArrowRight size={16}/></button><p className="micro-note">ใช้ Cloud AI · มีค่าใช้จ่ายต่อการสร้าง · จำกัด 2 ครั้ง/ทั้งเว็บ/วัน (8 ครั้ง/เดือน)</p></div></div>
          <div className="studio-preview"><div className="preview-header"><strong>ภาพผลลัพธ์</strong><span>{generatedImage?'GENERATED':'PREVIEW'}</span></div>{generatedImage ? <div className="generated-result"><img src={generatedImage.url} alt="ภาพที่สร้างโดย AI"/><div className="row wrap"><a className="btn primary" href={generatedImage.url} target="_blank" rel="noreferrer"><Download size={16}/> เปิด / บันทึกภาพ</a><button className="btn secondary" onClick={async()=>{try{const x=await runCloud('file-url',{key:generatedImage.key});setGeneratedImage(old=>({...old,url:x.url}));notify('ต่ออายุลิงก์แล้ว');}catch(e){notify(e.message);}}}><RefreshCw size={16}/> ต่ออายุลิงก์</button></div></div>:<div className="preview-empty"><div className="preview-illustration"><ImageIcon size={50} strokeWidth={1}/></div><h3>ผลงานของคุณจะปรากฏที่นี่</h3><p>ใส่ Prompt แล้วกดสร้างภาพเพื่อดูผลลัพธ์จริง</p></div>}</div></div>
          <div className="info-strip"><Shield size={18}/><span>เปิดเว็บใช้งานได้ทันทีโดยไม่ต้องล็อกอิน AI บน AWS มีค่าใช้จ่ายและจำกัดโควตารวมทั้งเว็บ หาก AWS ยังไม่อนุญาตโมเดลระบบจะแจ้งข้อผิดพลาดจริง</span></div>
        </>}
        {page === 'video' && <><div className="section-head"><div><p className="eyebrow">GENERATIVE / MOTION</p><h1>Video Studio</h1><p className="subtle">เปลี่ยนข้อความหรือรูปภาพเป็นวิดีโอด้วย Luma Ray2 (งานแบบ asynchronous)</p></div><span className="model-pill"><Film size={15}/> Luma Ray2</span></div>
          <div className="studio-grid"><div className="studio-form"><div className="card-panel"><h3>บรรยายฉากวิดีโอ</h3><PromptInput value={videoPrompt} onChange={setVideoPrompt} rows={6} placeholder="ตัวอย่าง: กล้องเคลื่อนช้า ๆ ผ่านป่าหมอกยามเช้า แสงอาทิตย์ส่องผ่านต้นไม้ นกบินผ่านเลนส์..."/><label className="field-label">ภาพอ้างอิง (ไม่บังคับ)</label><button className="upload-slot" onClick={() => fileRef.current?.click()}><Upload size={19}/>{attachment?.type.startsWith('image/') ? attachment.name : 'เลือกหรือวางภาพเพื่อสร้าง Image-to-Video'}</button><label className="field-label">อัตราส่วนภาพ</label><div className="choice-row">{['16:9','9:16','1:1','4:3','3:4'].map(v=><button key={v} className={'choice '+(videoAspect===v?'active':'')} onClick={()=>setVideoAspect(v)}>{v}</button>)}</div><label className="field-label">ความยาว</label><div className="choice-row">{['5s'].map(v=><button key={v} className={'choice '+(duration===v?'active':'')} onClick={()=>setDuration(v)}>{v} วินาที</button>)}</div><button className="btn primary full" disabled={!!busy||!videoPrompt.trim()} onClick={startVideo}>{busy==='video'?<LoaderCircle className="spin" size={18}/>:<Film size={18}/>} ส่งงานสร้างวิดีโอ <ArrowRight size={16}/></button><p className="micro-note">ใช้ AWS Marketplace · มีค่าใช้จ่าย · จำกัด 1 ครั้ง/ทั้งเว็บ/เดือน (5 วินาที)</p></div></div>
          <div className="studio-preview"><div className="preview-header"><strong>Video output</strong><span>{videoJob?.status||'QUEUE EMPTY'}</span></div>{videoJob ? <div className="video-result"><div className="video-result-top"><span className={'big-status '+(videoJob.status==='Completed'?'done':'')}><Film size={30}/></span><h3>{videoJob.status==='Completed'?'วิดีโอพร้อมแล้ว':videoJob.status==='Failed'?'สร้างไม่สำเร็จ':'กำลังสร้างวิดีโอ'}</h3><p>{videoJob.reason||('สถานะ: '+videoJob.status)}</p><p className="job-id">{videoJob.jobId?.split('/').pop()}</p></div>{videoJob.url && <video controls playsInline src={videoJob.url} className="result-video"/>}<div className="row wrap"><button className="btn secondary" onClick={refreshVideo}><RefreshCw size={16}/> ตรวจสถานะ</button>{videoJob.url && <a href={videoJob.url} className="btn primary" target="_blank" rel="noreferrer"><Download size={16}/> เปิดไฟล์ MP4</a>}{videoJob.key&&<button className="btn ghost" onClick={async()=>{try{const x=await runCloud('file-url',{key:videoJob.key});setVideoJob(j=>({...j,url:x.url}));}catch(e){notify(e.message)}}}>ต่ออายุลิงก์</button>}</div><button className="mini-link" onClick={() => {setVideoJob(null);localStorage.removeItem('run-ai-video-job');}}>เริ่มงานใหม่</button></div> : <div className="preview-empty"><div className="preview-illustration video"><Play size={45} strokeWidth={1}/></div><h3>ยังไม่มีงานวิดีโอ</h3><p>เมื่อส่งงานแล้ว ระบบจะตรวจสถานะให้ทุก 16 วินาที และแสดงไฟล์หลังเสร็จ</p></div>}</div></div>
        </>}
        {page === 'files' && <><div className="section-head"><div><p className="eyebrow">ASSET MANAGEMENT</p><h1>คลังไฟล์ส่วนตัว</h1><p className="subtle">เก็บและดูตัวอย่างภาพ วิดีโอ เสียง และไฟล์ข้อความในเบราว์เซอร์นี้</p></div><button className="btn primary" onClick={() => fileRef.current?.click()}><Plus size={17}/> เพิ่มไฟล์</button></div>
          <button className="drop-zone" onClick={()=>fileRef.current?.click()}><Upload size={27}/><strong>คลิกหรือวางไฟล์ลงที่นี่</strong><small>รูปภาพ · วิดีโอ · เสียง · TXT · JSON · PDF — สูงสุด 40 MB ต่อไฟล์</small></button>
          <div className="section-head small-head"><h2>ไฟล์ทั้งหมด <span className="count-pill">{assets.length}</span></h2><span className="subtle">เก็บใน IndexedDB · ไม่ซิงค์ข้ามเครื่อง</span></div>
          {assets.length===0 ? <div className="empty-panel"><FolderOpen size={40}/><h3>คลังไฟล์ยังว่าง</h3><p>อัปโหลดไฟล์เพื่อเริ่มสร้าง Workspace ของคุณ</p></div>:<div className="asset-grid">{assets.map(item=><div className="asset-card" key={item.id}><div className="asset-image"><AssetThumb item={item}/></div><div className="asset-info"><strong title={item.name}>{item.name}</strong><small>{formatSize(item.size)} · {new Date(item.created).toLocaleDateString('th-TH')}</small></div><div className="asset-actions">{item.type.startsWith('image/')&&<button title="แก้ไขภาพ" onClick={()=>{setEditing(item.file);openPage('editor');}}><SlidersHorizontal size={17}/></button>}<button title="เปิดหรือดาวน์โหลด" onClick={()=>downloadBlob(item.file,item.name)}><Download size={17}/></button><button title="ลบไฟล์" onClick={async()=>{if(!window.confirm('ลบ '+item.name+'?'))return;await deleteAsset(item.id);setReload(x=>x+1);}}><Trash2 size={17}/></button></div></div>)}</div>}
        </>}
        {page === 'editor' && <><div className="section-head"><div><p className="eyebrow">CREATIVE / LOCAL TOOLS</p><h1>Image Editor</h1><p className="subtle">ปรับแสง สี คอนทราสต์ หมุนและกลับภาพ โดยไม่ต้องจ่ายค่า AI</p></div><button className="btn secondary" onClick={()=>openPage('files')}><FolderOpen size={16}/> เปิดคลังไฟล์</button></div>{!editing && assets.some(a=>a.type.startsWith('image/'))&&<div className="choice-files">{assets.filter(a=>a.type.startsWith('image/')).slice(0,8).map(a=><button key={a.id} onClick={()=>setEditing(a.file)}><AssetThumb item={a}/><span>{a.name}</span></button>)}</div>}<ImageEditor file={editing} onSave={()=>setReload(x=>x+1)} notify={notify}/></>}
        {page === 'settings' && <><div className="section-head"><div><p className="eyebrow">CONFIGURATION</p><h1>AI & Cloud Settings</h1><p className="subtle">ตรวจสถานะของ AWS, โมเดล และข้อจำกัดค่าใช้จ่าย</p></div><button className="btn secondary" onClick={async()=>{try{setCloudStatus(await runCloud('status'));notify('อัปเดตสถานะ Cloud แล้ว');}catch(e){notify(e.message);}}}><RefreshCw size={16}/> ตรวจใหม่</button></div>
          <div className="setting-grid"><div className="card-panel"><div className="setting-head"><Cloud size={22}/><h3>Cloud Backend</h3></div><div className="setting-line"><span>AWS Amplify Gen 2</span><b className={cloudConfigured?'positive':'muted'}>{cloudConfigured?'เชื่อมต่อแล้ว':'ยังไม่เชื่อมต่อ'}</b></div><div className="setting-line"><span>Paid Bedrock API</span><b className={cloudReady?'positive':'muted'}>{cloudReady?'เปิดใช้สำหรับทดลอง':'ยังล็อกอยู่'}</b></div><div className="setting-line"><span>ระบบผู้เยี่ยมชม</span><b>เปิดเว็บได้ทันที</b></div>{cloudStatus?.error&&<p className="error-note">{cloudStatus.error}</p>}<p className="micro-note">ถ้าไม่มี Cloud ให้เชื่อม GitHub repository นี้กับ AWS Amplify Hosting และ Deploy ก่อน</p></div>
          <div className="card-panel"><div className="setting-head"><Shield size={22}/><h3>ป้องกันค่าใช้จ่าย</h3></div><div className="setting-line"><span>Chat / วัน</span><b>12 requests</b></div><div className="setting-line"><span>สร้างภาพ / วัน</span><b>2 requests</b></div><div className="setting-line"><span>สร้างวิดีโอ / เดือน</span><b>1 request</b></div><p className="micro-note">AI แบบเสียเงินเปิดสำหรับทดลองพร้อมโควตารวมทั้งเว็บ 12 แชต/วัน 2 ภาพ/วัน 1 วิดีโอ/เดือน (ความยาว 5 วินาที); ตั้งค่า AWS Budgets ด้วย</p></div>
          <div className="card-panel wide"><div className="setting-head"><Code2 size={22}/><h3>ระบบ Cloud AI สำหรับผู้เยี่ยมชม</h3></div><p>ไม่ต้องล็อกอินหรือใส่คีย์ AWS ที่หน้าเว็บ Cloud AI ใช้โควตาแบบรวม หากต้องการปิดการเรียกโมเดลเสียเงิน ให้ตั้งตัวแปรฝั่ง Amplify แล้ว Deploy ใหม่:</p><pre>RUN_AI_ENABLE_BEDROCK=0</pre><p className="micro-note">Amazon Bedrock / AWS Marketplace ต้องอนุญาตโมเดล และมีค่าบริการตามจริง แม้เปิดเว็บแบบไม่ล็อกอิน ลิงก์เว็บไซต์ไม่ใช่รหัสผ่าน ควรตั้ง AWS Budget Alarm</p><div className="row wrap">{signOut && <button className="btn ghost" onClick={signOut}>ออกจากระบบ</button>}<a className="btn secondary" href="https://github.com/tanawutmalirum29-ux/RUN-AI#setup" target="_blank" rel="noreferrer"><BookOpen size={16}/> อ่านวิธีติดตั้ง</a></div></div></div>
        </>}
      </div>
    </main>
    {alert&&<div className="toast"><span>{alert}</span><button onClick={()=>setAlert('')}><X size={16}/></button></div>}
    {dropOver&&<div className="drop-overlay"><Upload size={42}/><strong>วางไฟล์เพื่อเพิ่มเข้า Workspace</strong></div>}
  </div>;
}
