import React, { useEffect, useState } from 'react';
import { confirmSignUp, getCurrentUser, signIn, signOut, signUp } from 'aws-amplify/auth';
import { runAccount } from './service';
import './account.css';

/** Optional email account. No account or payment required for local Browser AI. */
export default function AccountPanel() {
  const [user,setUser]=useState(null);
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [code,setCode]=useState('');
  const [wallet,setWallet]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh = async () => {
    try { const current=await getCurrentUser(); setUser(current);
      const status=await runAccount('wallet-status');
      setWallet(status);
    } catch(e){setWallet(null);setUser(null);if(e?.name!=='UserUnAuthenticatedException')setError(e?.message||'ไม่สามารถอ่านบัญชีได้');}
  };
  useEffect(()=>{refresh()},[]);
  const action=async () => {
    if(loading)return;
    setLoading(true);setError('');setNotice('');
    try {
      if(mode==='register'){
        const result=await signUp({username:email.trim(),password,options:{userAttributes:{email:email.trim()}}});
        setMode(result.nextStep.signUpStep==='DONE'?'login':'verify');
        setNotice('ลงทะเบียนแล้ว ตรวจรหัสยืนยันที่อีเมล');
      }else if(mode==='verify'){
        await confirmSignUp({username:email.trim(),confirmationCode:code.trim()});
        setMode('login');setNotice('ยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบ');
      }else{
        const result=await signIn({username:email.trim(),password});
        if(!result.isSignedIn)throw new Error('โปรดยืนยันบัญชีตามขั้นตอนในอีเมลก่อน');
        await refresh();
        setPassword('');
      }
    }catch(e){setError(e?.message||'ดำเนินการไม่สำเร็จ');}
    finally{setLoading(false);}
  };
  const logout=async()=>{setLoading(true);setError('');
    try{await signOut();setUser(null);setWallet(null);setNotice('ออกจากบัญชีเรียบร้อย');}
    catch(e){setError(e?.message||'ออกจากระบบไม่สำเร็จ');}
    finally{setLoading(false);}
  };
  return <section className="account-panel card-panel">
    <h3>บัญชี RUN-AI · เตรียมระบบเครดิต</h3>
    <p className="micro-note">Browser AI และเครื่องมือในเครื่องใช้ฟรีโดยไม่ต้องเข้าสู่ระบบ ส่วนเครดิตซื้อขายยังไม่เปิดใช้งาน</p>
    {user ? <>
      <div className="account-profile"><strong>{user.signInDetails?.loginId||user.username}</strong><span>ยืนยันตัวตนแล้ว</span></div>
      {wallet && <div className="account-wallet"><span>เครดิตคงเหลือ</span><strong>{wallet.balance} RUN เครดิต</strong><small>ยังไม่เปิดระบบเติมเงิน / การชำระเงินจริง</small></div>}
      <div className="row wrap"><button type="button" className="btn secondary" onClick={refresh} disabled={loading}>ตรวจเครดิตใหม่</button><button type="button" className="btn ghost" onClick={logout} disabled={loading}>ออกจากบัญชี</button></div>
    </> : <>
      <div className="account-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>setMode('login')}>เข้าสู่ระบบ</button><button type="button" className={mode==='register'?'active':''} onClick={()=>setMode('register')}>สมัครบัญชี</button></div>
      <form className="account-form" onSubmit={e=>{e.preventDefault();action()}}>
        <label htmlFor="runaccount-email">อีเมล</label>
        <input id="runaccount-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
        {mode==='verify' ? <>
          <label htmlFor="runaccount-code">รหัสยืนยันจากอีเมล</label>
          <input id="runaccount-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e=>setCode(e.target.value)}/>
        </> : <>
          <label htmlFor="runaccount-pass">รหัสผ่าน</label>
          <input id="runaccount-pass" type="password" autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/>
        </>}
        <button type="submit" className="btn primary" disabled={loading}>{loading?'กำลังตรวจสอบ...':mode==='verify'?'ยืนยันอีเมล':mode==='register'?'สร้างบัญชี':'เข้าสู่ระบบ'}</button>
        {mode==='verify'&&<button type="button" className="btn secondary" onClick={()=>setMode('login')}>กลับไปเข้าสู่ระบบ</button>}
      </form>
    </>}
    {error&&<p className="account-error" role="alert">{error}</p>}
    {notice&&<p className="account-notice">{notice}</p>}
  </section>;
}
