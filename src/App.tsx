import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

const MASTER_DCS = ['DC2', 'DC6', 'DC7.2'];

function App() {
  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'driver'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [driverJobData, setDriverJobData] = useState<any>(null);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  
  const [dockModal, setDockModal] = useState<{ isOpen: boolean; job: any; docks: any[]; selectedDocks: string[]; requiredCount: number } | null>(null);

  const [adminTab, setAdminTab] = useState<'plan' | 'dashboard' | 'utilization'>('plan');
  const [dailyPlans, setDailyPlans] = useState<any[]>([]);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [checkInModal, setCheckInModal] = useState<{ isOpen: boolean; plan: any; selectedDC: string } | null>(null);
  const [masterDocksList, setMasterDocksList] = useState<any[]>([]);

  const initialPlanForm = { transport_summary_no: '', job_no: '', vendor_code: '', vendor_name: '', transport_type: '', license_plate: '', trailer_plate: '', driver_name: '', transport_company: '', appointment_no: '' };
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState<any>(initialPlanForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        if (rows.length < 2) throw new Error('ไฟล์ว่างเปล่า');
        const parseCSVLine = (str: string) => {
          const arr = []; let quote = false; let col = '';
          for (let i = 0; i < str.length; i++) {
            if (str[i] === '"') { quote = !quote; }
            else if (str[i] === ',' && !quote) { arr.push(col.trim()); col = ''; }
            else { col += str[i]; }
          }
          arr.push(col.trim()); return arr;
        };
        const headers = parseCSVLine(rows[0]).map(h => h.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').toLowerCase().trim());
        const getCol = (cols: string[], possibleNames: string[]) => {
          const index = headers.findIndex(h => possibleNames.includes(h));
          return index !== -1 ? cols[index] : '';
        };
        const insertData = [];
        for (let i = 1; i < rows.length; i++) {
          const cols = parseCSVLine(rows[i]);
          const payload = {
            transport_summary_no: getCol(cols, ['transport_summary_no', 'summary']),
            job_no: getCol(cols, ['job_no', 'job']),
            vendor_code: getCol(cols, ['vendor_code']),
            vendor_name: getCol(cols, ['vendor_name', 'vendor']),
            transport_type: getCol(cols, ['transport_type', 'type']),
            license_plate: getCol(cols, ['license_plate', 'license']),
            trailer_plate: getCol(cols, ['trailer_plate', 'trailer']),
            driver_name: getCol(cols, ['driver_name', 'driver']),
            transport_company: getCol(cols, ['transport_company', 'company']),
            appointment_no: getCol(cols, ['appointment_no', 'appointment']),
          };
          if (payload.license_plate || payload.job_no) insertData.push(payload);
        }
        if (insertData.length > 0) {
          const { error } = await supabase.from('daily_plan').insert(insertData);
          if (error) throw error; alert(`✅ นำเข้าสำเร็จ ${insertData.length} รายการ!`); fetchDailyPlans(); 
        }
      } catch (error: any) { alert(`❌ เกิดข้อผิดพลาด: ${error.message}`); } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''; 
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const fetchAllJobs = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = `${todayStr}T00:00:00.000Z`; const endOfDay = `${todayStr}T23:59:59.999Z`; 
    const { data } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).order('check_in_time', { ascending: true }).or(`and(check_in_time.gte.${startOfDay},check_in_time.lte.${endOfDay}),status.neq.Finish`);
    if (data) setAllJobs(data);
  };
  const fetchDailyPlans = async () => { const { data } = await supabase.from('daily_plan').select('*').order('id', { ascending: false }).limit(300); if (data) setDailyPlans(data); };
  const fetchMasterDocksList = async () => { const { data } = await supabase.from('master_docks').select('*').order('dock_no', { ascending: true }); if (data) setMasterDocksList(data); };
  
  const fetchDriverJob = async () => {
    if (!driverJobData) return;
    const { data } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).eq('id', driverJobData.id).single();
    if (data) { if (data.status === 'Finish') { alert('🏁 งานของคุณเสร็จสิ้นเรียบร้อยแล้ว!'); handleLogout(); } else { setDriverJobData(data); } }
  };

  useEffect(() => {
    if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); }
    if (currentView === 'driver') fetchDriverJob();
    const timer = setInterval(() => {
      if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); }
      if (currentView === 'driver') fetchDriverJob();
    }, 3000);
    return () => clearInterval(timer);
  }, [currentView, driverJobData]);

  const handleExportCSV = () => {
    if (allJobs.length === 0) { alert('ไม่มีข้อมูลให้ Export ครับ'); return; }
    const headers = ['เลขคิว', 'เส้นทาง', 'ทะเบียนรถ', 'ประเภท', 'Vendor', 'ช่องจอด', 'สถานะ', 'Check In', 'Call Up', 'On Dock', 'Start Load', 'End Load', 'Finish'];
    const formatTime = (isoString: string | null) => isoString ? new Date(isoString).toLocaleString('th-TH') : '-';
    const csvData = allJobs.map(job => `"${displayQueue(job.queue_number)}","${getDCRoute(job.queue_number)}","${getDisplayPlate(job.daily_plan)}","${job.daily_plan?.transport_type || '-'}","${job.daily_plan?.vendor_name || '-'}","${job.dock_number || '-'}","${job.status}","${formatTime(job.check_in_time)}","${formatTime(job.call_time)}","${formatTime(job.on_dock_time)}","${formatTime(job.start_load_time)}","${formatTime(job.end_load_time)}","${formatTime(job.finish_time)}"`);
    const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvData].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', `Dock_Report.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); const user = username.toLowerCase().trim(); const pass = password.trim();
    if (user === 'admin' && pass === '1234') { setCurrentView('admin'); setUsername(''); setPassword(''); }
    else {
      const inputDigits = user.replace(/\D/g, ''); const passDigits = pass.replace(/\D/g, '');
      if (inputDigits && inputDigits === passDigits) {
        const { data } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).neq('status', 'Finish');
        const matchedJob = data?.find((job) => { const lp = (job.daily_plan?.license_plate || '').replace(/\D/g, ''); const tp = (job.daily_plan?.trailer_plate || '').replace(/\D/g, ''); return (lp && lp === inputDigits) || (tp && tp === inputDigits); });
        if (matchedJob) { setCurrentView('driver'); setDriverJobData(matchedJob); setUsername(''); setPassword(''); }
        else { alert('❌ รถทะเบียนนี้ยังไม่ Check In หรือใส่รหัสไม่ถูกต้อง'); }
      } else { alert('❌ ชื่อผู้ใช้ หรือ รหัสผ่านไม่ถูกต้อง!'); }
    }
  };

  const handleLogout = () => { setCurrentView('login'); setDriverJobData(null); setCheckInModal(null); setPlanSearchQuery(''); };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { id, ...payloadWithoutId } = planForm;
      const isEdit = !!id;
      if (isEdit) { await supabase.from('daily_plan').update(planForm).eq('id', id); alert('✅ อัปเดตสำเร็จ'); } 
      else { await supabase.from('daily_plan').insert([payloadWithoutId]); alert('✅ เพิ่มรายการสำเร็จ'); }
      setShowPlanForm(false); fetchDailyPlans();
    } catch (error) { alert('❌ เกิดข้อผิดพลาด'); }
  };

  const handleCancelPlan = async (id: string) => { 
    if (!window.confirm('ยืนยันการลบแผนงานนี้?')) return; 
    try { await supabase.from('daily_plan').delete().eq('id', id); fetchDailyPlans(); } catch (error) {} 
  };

  const handleCheckIn = async () => {
    if (!checkInModal || !checkInModal.selectedDC) { alert('❌ เลือกคลัง'); return; }
    const planData = checkInModal.plan; const selectedDC = checkInModal.selectedDC;
    try {
      const isT18W = planData.transport_type === 'T18W'; const isSpecialCompany = planData.transport_company?.includes('พรอรุณ') || planData.transport_company?.includes('คาร์โก้');
      let queueNo = ''; const dd = String(new Date().getDate()).padStart(2, '0'); const mm = String(new Date().getMonth() + 1).padStart(2, '0');
      const dcNum = selectedDC === 'DC7.2' ? '7' : selectedDC.replace('DC', ''); const prefix = `${dcNum}-${dd}${mm}-`;
      if (!(isT18W && isSpecialCompany)) { const { count } = await supabase.from('backhaul_jobs').select('*', { count: 'exact', head: true }).like('queue_number', `${prefix}%`); queueNo = `${prefix}${String((count || 0) + 1).padStart(3, '0')}`; } 
      else { queueNo = `${dcNum}-VIP`; }
      const { data: existing } = await supabase.from('backhaul_jobs').select('id').eq('daily_plan_id', planData.id).neq('status', 'Finish').limit(1);
      if (existing && existing.length > 0) { alert('⚠️ Check-in ไปแล้ว'); setCheckInModal(null); return; }
      await supabase.from('backhaul_jobs').insert([{ daily_plan_id: planData.id, queue_number: queueNo, status: 'Call Up' }]);
      alert(`✅ เช็คอินสำเร็จ!`); setCheckInModal(null); fetchAllJobs();
    } catch (error: any) { alert('❌ เกิดข้อผิดพลาด'); }
  };

  const executeStatusUpdate = async (jobId: string, updateData: any) => {
    try { await supabase.from('backhaul_jobs').update(updateData).eq('id', jobId); if (currentView === 'admin') fetchAllJobs(); if (currentView === 'driver') fetchDriverJob(); } catch (error) {}
  };

  const releaseDocks = async (jobId: string) => { try { await supabase.from('master_docks').update({ status: 'Available', current_job_id: null, current_plate: null }).eq('current_job_id', jobId); } catch (error) {} };

  const handleUpdateStatus = async (job: any, currentStatus: string) => {
    const activeStatus = currentStatus; let nextStatus = ''; let updateData: any = {};
    if (activeStatus === 'Call Up') {
      const isTrailer = job.daily_plan?.transport_type === 'T6WT' || job.daily_plan?.transport_type === 'T10WT'; const requiredCount = isTrailer ? 2 : 1; const bhGroup = getDCRoute(job.queue_number);
      const { data } = await supabase.from('master_docks').select('*').eq('bh_group', bhGroup).in('allowed_type', ['Inbound', 'Both']).order('dock_no', { ascending: true });
      setDockModal({ isOpen: true, job, docks: data || [], selectedDocks: [], requiredCount }); return;
    } 
    else if (activeStatus === 'Assigned') { nextStatus = 'On Dock'; updateData = { status: nextStatus, on_dock_time: new Date().toISOString() }; }
    else if (activeStatus === 'On Dock') { nextStatus = 'Unloading'; updateData = { status: nextStatus, start_load_time: new Date().toISOString() }; }
    else if (activeStatus === 'Unloading') { nextStatus = 'End Load'; updateData = { status: nextStatus, end_load_time: new Date().toISOString() }; }
    else if (activeStatus === 'End Load') { nextStatus = 'Off Dock'; updateData = { status: nextStatus, finish_time: new Date().toISOString() }; await releaseDocks(job.id); }
    else if (activeStatus === 'Off Dock') { nextStatus = 'Finish'; updateData = { status: nextStatus }; }
    if (nextStatus) { await executeStatusUpdate(job.id, updateData); }
  };

  const handleConfirmDock = async () => {
    if (!dockModal || dockModal.selectedDocks.length !== dockModal.requiredCount) return;
    const { job, selectedDocks } = dockModal; const dockNo = selectedDocks.join(', ');
    await executeStatusUpdate(job.id, { status: 'Assigned', dock_number: dockNo, call_time: new Date().toISOString() });
    await supabase.from('master_docks').update({ status: 'Occupied', current_job_id: job.id, current_plate: getDisplayPlate(job.daily_plan) }).in('dock_no', selectedDocks);
    setDockModal(null);
  };

  const handleRollbackStatus = async (jobId: string, currentStatus: string) => {
    if (!window.confirm(`ต้องการย้อนกลับสถานะ?`)) return;
    let prev = ''; let update: any = {};
    if (currentStatus === 'Assigned') { prev = 'Call Up'; update = { status: prev, dock_number: null, call_time: null }; await releaseDocks(jobId); }
    else if (currentStatus === 'On Dock') { prev = 'Assigned'; update = { status: prev, on_dock_time: null }; }
    else if (currentStatus === 'Unloading') { prev = 'On Dock'; update = { status: prev, start_load_time: null }; }
    else if (currentStatus === 'End Load') { prev = 'Unloading'; update = { status: prev, end_load_time: null }; }
    else if (currentStatus === 'Off Dock') { prev = 'End Load'; update = { status: prev, finish_time: null }; }
    if (prev) await executeStatusUpdate(jobId, update);
  };

  const renderActionButton = (job: any) => {
    if (job.status === 'Finish') return <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✅ เสร็จสิ้น</span>;
    const active = job.status;
    const btnMap: any = { 'Call Up': ['📢 Assign Dock', 'call-up'], 'Assigned': ['🚚 รถเข้า Dock', 'assigned'], 'On Dock': ['📦 เริ่มลงสินค้า', 'on-dock'], 'Unloading': ['✅ ลงสินค้าจบ', 'unloading'], 'End Load': ['🔙 ถอยออกจาก Dock', 'end-load'], 'Off Dock': ['🏁 Check Out', 'off-dock'] };
    return btnMap[active] ? (
      <div className="action-stack">
        <button className={`btn-action ${btnMap[active][1]}`} onClick={() => handleUpdateStatus(job, active)}>{btnMap[active][0]}</button>
        {currentView === 'admin' && active !== 'Call Up' && <button className="btn-rollback" onClick={() => handleRollbackStatus(job.id, active)}>⏪ Undo</button>}
      </div>
    ) : <span>-</span>;
  };

  const getDisplayPlate = (plan: any) => { if (!plan) return '-'; if (plan.transport_type === 'T18W') return plan.trailer_plate || '-'; if (plan.transport_type === 'T6WT' || plan.transport_type === 'T10WT') return `${plan.license_plate || '-'} / ${plan.trailer_plate || '-'}`; return plan.license_plate || '-'; };
  const displayQueue = (q: string | null) => (!q || q.includes('VIP')) ? '-' : q.split(' (')[0];
  const getDCRoute = (q: string | null) => { if (!q) return '-'; const m = q.match(/\((.*)\)/); return m ? m[1] : (q.startsWith('2-') ? 'DC2' : q.startsWith('6-') ? 'DC6' : 'DC7.2'); };
  
  const filteredPlans = dailyPlans.filter(p => !planSearchQuery || (p.license_plate?.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.vendor_name?.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.vendor_code?.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.job_no?.toLowerCase().includes(planSearchQuery.toLowerCase()) || p.transport_summary_no?.toLowerCase().includes(planSearchQuery.toLowerCase())));
  const isPlanCheckedIn = (planId: string) => allJobs.some(job => job.daily_plan_id === planId && job.status !== 'Finish');

  const getKPIs = () => {
    let totalL = 0; let countL = 0; let totalW = 0; let countW = 0;
    allJobs.forEach(job => {
      if (job.call_time && job.check_in_time) { const w = (new Date(job.call_time).getTime() - new Date(job.check_in_time).getTime()) / 60000; if (w >= 0) { totalW += w; countW++; } }
      if (job.finish_time && job.on_dock_time) { const l = (new Date(job.finish_time).getTime() - new Date(job.on_dock_time).getTime()) / 60000; if (l >= 0) { totalL += l; countL++; } }
    });
    return { total: allJobs.length, completed: allJobs.filter(j => j.status === 'Finish').length, avgWait: countW > 0 ? (totalW / countW).toFixed(0) : 0, avgLoad: countL > 0 ? (totalL / countL).toFixed(0) : 0 };
  };

  const renderHeatmap = () => {
    const grouped = masterDocksList.reduce((acc, dock) => { if (!acc[dock.physical_dc]) acc[dock.physical_dc] = []; acc[dock.physical_dc].push(dock); return acc; }, {} as any);
    return Object.keys(grouped).sort().map(dc => (
      <div key={dc} style={{ marginBottom: '25px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h4 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginTop: 0, fontSize: '18px', color: '#334155' }}>📍 คลัง {dc}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '15px' }}>
          {grouped[dc].map((dock: any) => {
            const isOccupied = dock.status === 'Occupied'; const isOutbound = dock.allowed_type === 'Outbound';
            return (
              <div key={dock.id} title={`ประตู ${dock.dock_no}`} style={{ width: '65px', height: '65px', backgroundColor: isOccupied ? '#ef4444' : (isOutbound ? '#cbd5e1' : '#22c55e'), color: isOutbound ? '#475569' : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: '900' }}>{dock.dock_no}</span>
                {isOccupied && <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.25)', padding: '2px 4px', borderRadius: '4px', marginTop: '3px', maxWidth: '90%', overflow: 'hidden', whiteSpace: 'nowrap' }}>{dock.current_plate || 'มีรถ'}</span>}
              </div>
            )
          })}
        </div>
      </div>
    ));
  };

  if (currentView === 'login') return (
    <div className="container login-container"><div className="card login-card"><h2>🚚 Truck Management</h2><p className="subtitle">กรุณาเข้าสู่ระบบ</p>
      <form onSubmit={handleLogin} className="login-form">
        <div className="form-group"><label>ชื่อผู้ใช้งาน</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} required /></div>
        <div className="form-group"><label>รหัสผ่าน</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <button type="submit" className="btn-login">เข้าสู่ระบบ</button>
      </form>
    </div></div>
  );

  return (
    <div className="container">
      <div className="top-bar"><span>👤 เข้าระบบโดย: <strong>{currentView.toUpperCase()}</strong></span><button className="btn-logout" onClick={handleLogout}>🚪 ออกจากระบบ</button></div>
      
      {currentView === 'driver' && driverJobData && (
        <div className="card driver-view">
          <h2>สถานะงานของคุณ</h2>
          <div className="status-box">
             <p>ทะเบียน: <strong>{getDisplayPlate(driverJobData.daily_plan)}</strong></p>
             <p>ช่องจอด: <strong>{driverJobData.dock_number || 'รอคิว'}</strong></p>
             <p>สถานะปัจจุบัน: <strong style={{color:'#1976d2', fontSize: '20px'}}>{driverJobData.status}</strong></p>
          </div>
        </div>
      )}

      {currentView === 'admin' && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => setAdminTab('plan')} style={{ padding: '10px 20px', background: adminTab === 'plan' ? '#1976d2' : '#f1f5f9', color: adminTab === 'plan' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>📑 แผนงาน (Daily Plan)</button>
            <button onClick={() => setAdminTab('dashboard')} style={{ padding: '10px 20px', background: adminTab === 'dashboard' ? '#1976d2' : '#f1f5f9', color: adminTab === 'dashboard' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🚛 รายการรถ Backhaul</button>
            <button onClick={() => setAdminTab('utilization')} style={{ padding: '10px 20px', background: adminTab === 'utilization' ? '#10b981' : '#f1f5f9', color: adminTab === 'utilization' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>📊 พื้นที่ลาน (Utilization)</button>
          </div>
          {adminTab === 'plan' && (
            <div className="dashboard-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <input type="text" placeholder="🔍 ค้นหา..." value={planSearchQuery} onChange={e => setPlanSearchQuery(e.target.value)} style={{ padding: '10px', width: '300px' }} />
                <div>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-action call-up" style={{ marginRight: '10px' }}>📥 นำเข้า CSV</button>
                  <button onClick={() => { setPlanForm(initialPlanForm); setShowPlanForm(true); }} className="btn-action on-dock">➕ เพิ่มรายการ</button>
                </div>
              </div>
              <table className="dashboard-table">
                <thead><tr><th>Job No</th><th>Vendor</th><th>ทะเบียนรถ</th><th>ประเภท</th><th>สถานะ</th><th>Action</th></tr></thead>
                <tbody>
                  {filteredPlans.map(plan => (
                    <tr key={plan.id}>
                      <td>{plan.job_no}</td><td>{plan.vendor_code ? `[${plan.vendor_code}] ` : ''}{plan.vendor_name}</td><td>{getDisplayPlate(plan)}</td><td>{plan.transport_type}</td>
                      <td>{isPlanCheckedIn(plan.id) ? '✅ Checked In' : '⏳ Pending'}</td>
                      <td>
                        {!isPlanCheckedIn(plan.id) && <button onClick={() => setCheckInModal({ isOpen: true, plan, selectedDC: '' })} className="btn-action assigned">🟢 Check-In</button>}
                        <button onClick={() => handleCancelPlan(plan.id)} style={{marginLeft: '10px', background: '#ef4444', color: 'white', padding: '5px 10px', border: 'none', borderRadius: '4px'}}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {adminTab === 'dashboard' && (
            <div className="dashboard-card">
              <button onClick={handleExportCSV} style={{ marginBottom: '15px', background: '#10b981', color: 'white', padding: '10px' }}>📥 Export CSV</button>
              <table className="dashboard-table">
                <thead><tr><th>เวลา Check In</th><th>Queue</th><th>ทะเบียน</th><th>Vendor</th><th>Dock</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {allJobs.map(job => (
                    <tr key={job.id}>
                      <td>{new Date(job.check_in_time).toLocaleTimeString('th-TH')}</td><td>{displayQueue(job.queue_number)}</td><td>{getDisplayPlate(job.daily_plan)}</td>
                      <td>{job.daily_plan?.vendor_name}</td><td>{job.dock_number || '-'}</td><td>{job.status}</td><td>{renderActionButton(job)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {adminTab === 'utilization' && (
            <div className="dashboard-card">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
                <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '8px' }}>รถเข้าลานทั้งหมด: <strong>{getKPIs().total}</strong> คัน</div>
                <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px' }}>ลงสินค้าจบ: <strong>{getKPIs().completed}</strong> คัน</div>
                <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '8px' }}>รอคิวเฉลี่ย: <strong>{getKPIs().avgWait}</strong> นาที</div>
                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px' }}>ลงของเฉลี่ย: <strong>{getKPIs().avgLoad}</strong> นาที</div>
              </div>
              {renderHeatmap()}
            </div>
          )}
        </div>
      )}

      {checkInModal?.isOpen && (
        <div className="modal-overlay"><div className="modal-card">
          <h3>เลือกคลังสินค้า</h3>
          {MASTER_DCS.map(dc => <label key={dc}><input type="radio" value={dc} checked={checkInModal.selectedDC === dc} onChange={e => setCheckInModal({...checkInModal, selectedDC: e.target.value})} /> {dc} </label>)}
          <button onClick={handleCheckIn}>ยืนยัน</button><button onClick={() => setCheckInModal(null)}>ยกเลิก</button>
        </div></div>
      )}
      
      {showPlanForm && (
        <div className="modal-overlay"><div className="modal-card">
          <h3>{planForm.id ? 'แก้ไขข้อมูลรถ' : 'เพิ่มข้อมูลรถ'}</h3>
          <form onSubmit={handleSavePlan}>
            <div className="form-group"><label>License Plate</label><input required value={planForm.license_plate} onChange={e => setPlanForm({...planForm, license_plate: e.target.value})} /></div>
            <div className="form-group"><label>Vendor Name</label><input required value={planForm.vendor_name} onChange={e => setPlanForm({...planForm, vendor_name: e.target.value})} /></div>
            <div className="form-group"><label>Transport Type</label><input required value={planForm.transport_type} onChange={e => setPlanForm({...planForm, transport_type: e.target.value})} /></div>
            <button type="submit">บันทึก</button>
            <button type="button" onClick={() => setShowPlanForm(false)}>ยกเลิก</button>
          </form>
        </div></div>
      )}

      {dockModal?.isOpen && (
        <div className="modal-overlay"><div className="modal-card">
          <h3>เลือกช่องจอด (ต้องการ {dockModal.requiredCount} ช่อง)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {dockModal.docks.map(dock => (
              <button key={dock.id} disabled={dock.status === 'Occupied'} onClick={() => {
                let s = [...dockModal.selectedDocks];
                if (s.includes(dock.dock_no)) s = s.filter(d => d !== dock.dock_no); else if (s.length < dockModal.requiredCount) s.push(dock.dock_no);
                setDockModal({...dockModal, selectedDocks: s});
              }} style={{ background: dock.status === 'Occupied' ? 'red' : dockModal.selectedDocks.includes(dock.dock_no) ? 'blue' : 'green', color: 'white', padding: '10px' }}>{dock.dock_no}</button>
            ))}
          </div>
          <button onClick={handleConfirmDock}>ยืนยัน</button>
        </div></div>
      )}
    </div>
  );
}
export default App;