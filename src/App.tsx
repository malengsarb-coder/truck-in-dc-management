// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

const MASTER_DCS = ['DC2', 'DC6', 'DC7.2'];

function App() {
  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'receiver' | 'driver' | 'unloader' | 'yard' | 'shunt'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [receiverDC, setReceiverDC] = useState('');
  const [driverJobData, setDriverJobData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [waitingJobs, setWaitingJobs] = useState<any[]>([]);
  const [multiDropConfig, setMultiDropConfig] = useState<{ job: any; step: 'ask' | 'select' } | null>(null);
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [yardCompanyId, setYardCompanyId] = useState('');
  const [yardContainerNo, setYardContainerNo] = useState('');
  const [yardOrigin, setYardOrigin] = useState('');
  const [yardDestination, setYardDestination] = useState('');
  const [yardOrders, setYardOrders] = useState<any[]>([]);
  const [shuntCompany, setShuntCompany] = useState('');
  const [shuntOrders, setShuntOrders] = useState<any[]>([]);
  
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lastAlertStatus, setLastAlertStatus] = useState('');

  const [dockModal, setDockModal] = useState<{ isOpen: boolean; job: any; docks: any[]; selectedDocks: string[]; requiredCount: number } | null>(null);

  const [adminTab, setAdminTab] = useState<'plan' | 'dashboard' | 'utilization' | 'exec' | 'outbound' | 'dockutil'>('plan');
  const [dockUtilDate, setDockUtilDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dockUtilDC, setDockUtilDC] = useState(MASTER_DCS[0]);
  const [dockUtilMode, setDockUtilMode] = useState<'inbound' | 'outbound'>('inbound');
  const [dockUtilInbound, setDockUtilInbound] = useState<any[]>([]);
  const [dockUtilOutbound, setDockUtilOutbound] = useState<any[]>([]);
  const [dockUtilLoading, setDockUtilLoading] = useState(false);
  const [dailyPlans, setDailyPlans] = useState<any[]>([]);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [checkInModal, setCheckInModal] = useState<{ isOpen: boolean; plan: any; selectedDC: string } | null>(null);
  const [masterDocksList, setMasterDocksList] = useState<any[]>([]);

  const initialPlanForm = { id: '', schedule_date: '', transport_summary_no: '', job_no: '', subjobtype: '', vendor_code: '', vendor_name: '', transport_type: '', license_plate: '', trailer_plate: '', driver_name: '', transport_company: '', appointment_no: '' };
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState(initialPlanForm);

  const [outboundJobs, setOutboundJobs] = useState<any[]>([]);
  const [outboundModal, setOutboundModal] = useState<any>(null);
  const [shuntTab, setShuntTab] = useState<'tasks' | 'outbound'>('tasks');
  const [yardTab, setYardTab] = useState<'tasks' | 'outbound'>('tasks');
  const [moveModal, setMoveModal] = useState<any>(null);
  const [dropModal, setDropModal] = useState<any>(null); 
  const [foremanActionModal, setForemanActionModal] = useState<any>(null); 
  const [allDocksList, setAllDocksList] = useState<any[]>([]); 

  const fileInputRef = useRef<HTMLInputElement>(null);

  const playAlertSound = (type: string) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      
      const playBeep = (freq: number, oscType: any, timeOffset: number, dur: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = oscType;
        osc.frequency.value = freq;
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + timeOffset);
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime + timeOffset);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + timeOffset + dur);
        osc.stop(audioCtx.currentTime + timeOffset + dur);
      };

      if (type === 'assign') {
        playBeep(880, 'sine', 0, 0.5);
        playBeep(1046.50, 'sine', 0.2, 0.8);
      } else if (type === 'endload') {
        playBeep(600, 'triangle', 0, 0.3);
        playBeep(600, 'triangle', 0.4, 0.3);
        playBeep(600, 'triangle', 0.8, 0.3);
      }
    } catch(e) {
      console.log('Audio not supported or disabled by browser', e);
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;

        const firstLine = (text.split(/\r?\n/)[0]) || '';
        let delimiter = ',';
        if (firstLine.includes('\t')) delimiter = '\t';
        else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

        const parseCSV = (input: string, delim: string) => {
          const out: string[][] = []; let row: string[] = []; let col = ''; let quote = false;
          for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (quote) {
              if (ch === '"') { if (input[i + 1] === '"') { col += '"'; i++; } else { quote = false; } }
              else { col += ch; }
            } else {
              if (ch === '"') { quote = true; }
              else if (ch === delim) { row.push(col); col = ''; }
              else if (ch === '\r') {  }
              else if (ch === '\n') { row.push(col); out.push(row); row = []; col = ''; }
              else { col += ch; }
            }
          }
          if (col !== '' || row.length > 0) { row.push(col); out.push(row); }
          return out.filter((r) => r.some((c) => c.trim() !== ''));
        };

        const allRows = parseCSV(text, delimiter);
        if (allRows.length < 2) throw new Error('ไฟล์ว่างเปล่า หรือไม่มีข้อมูล');

        const headers = allRows[0].map((h) => h.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').toLowerCase().trim());
        const getCol = (cols: string[], possibleNames: string[]) => {
          const index = headers.findIndex((h) => possibleNames.includes(h));
          return (index !== -1 && cols[index]) ? String(cols[index]).trim() : '';
        };

        const insertData = [];
        for (let i = 1; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 2) continue; 
          
          let license = getCol(cols, ['license_plate', 'ทะเบียนหัว', 'license', 'ทะเบียนรถ']);
          if (license.toLowerCase().includes('รอ assign')) { license = ''; }

          let rawDate = getCol(cols, ['schedule_date', 'schedule date', 'วันที่', 'วันที่จัดส่ง', 'วันที่แผน']);
          let formattedDate = filterDate; 
          if (rawDate) {
            if (rawDate.includes('/')) {
              const p = rawDate.split(' ')[0].split('/'); 
              if (p.length === 3) {
                let y = parseInt(p[2]);
                if (y > 2500) y -= 543; 
                else if (y < 100) y += 2000; 
                let m = p[1].padStart(2, '0');
                let d = p[0].padStart(2, '0');
                formattedDate = `${y}-${m}-${d}`;
              }
            } else if (rawDate.includes('-')) {
               formattedDate = rawDate.split(' ')[0]; 
            }
          }

          const payload = {
            schedule_date: formattedDate,
            transport_summary_no: getCol(cols, ['transport_summary_no', 'เลขที่ transport summary bh', 'transport summary no', 'summary']),
            job_no: getCol(cols, ['job_no', 'bh job no', 'job no', 'job', 'เลขที่งาน']),
            subjobtype: getCol(cols, ['subjobtype', 'sub job type']),
            vendor_code: getCol(cols, ['vendor_code', 'จุดรับสินค้า', 'vendor code']),
            vendor_name: getCol(cols, ['vendor_name', 'ชื่อจุดรับสินค้า', 'vendor name', 'vendor']),
            transport_type: getCol(cols, ['transport_type', 'ประเภทรถที่ปล่อย', 'ประเภทรถ', 'type']),
            license_plate: license,
            trailer_plate: getCol(cols, ['trailer_plate', 'ทะเบียนหาง', 'trailer plate', 'trailer']),
            driver_name: getCol(cols, ['driver_name', 'ชื่อ พขร', 'ชื่อ พขร.', 'ชื่อพขร.', 'driver']),
            transport_company: getCol(cols, ['transport_company', 'บริษัทขนส่ง', 'transport company', 'company']),
            appointment_no: getCol(cols, ['appointment_no', 'เลขที่ appointment', 'appointment no', 'appointment']),
          };
          if (payload.license_plate || payload.job_no) { insertData.push(payload); }
        }
        if (insertData.length > 0) {
          const { error } = await supabase.from('daily_plan').insert(insertData);
          if (error) throw error;
          alert(`✅ นำเข้าข้อมูลสำเร็จ ${insertData.length} รายการ!`);
          fetchDailyPlans();
        } else { alert('⚠️ ไม่พบข้อมูลที่ตรงกับฟอร์แมตในไฟล์ (ตรวจไม่พบคอลัมน์ job_no หรือ ข้อมูลว่างเปล่า)'); }
      } catch (error: any) { alert(`❌ เกิดข้อผิดพลาด: ${error.message}`); } finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const fetchCompanies = async () => { const { data } = await supabase.from('companies').select('*'); if (data) setCompaniesList(data); };
  
  const fetchAllJobs = async () => {
    const startOfDay = `${filterDate}T00:00:00.000Z`; const endOfDay = `${filterDate}T23:59:59.999Z`; const todayStr = new Date().toISOString().split('T')[0];
    let query = supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).order('check_in_time', { ascending: true });
    if (filterDate === todayStr) { query = query.or(`and(check_in_time.gte.${startOfDay},check_in_time.lte.${endOfDay}),status.neq.Finish`); } else { query = query.gte('check_in_time', startOfDay).lte('check_in_time', endOfDay); }
    const { data } = await query; if (data) setAllJobs(data);
  };

  const fetchDailyPlans = async () => { 
    const { data } = await supabase.from('daily_plan')
      .select('*, backhaul_jobs(id, status)')
      .eq('schedule_date', filterDate)
      .order('id', { ascending: false })
      .limit(500); 
    if (data) setDailyPlans(data); 
  };

  const fetchMasterDocksList = async () => { const { data } = await supabase.from('master_docks').select('*').eq('is_active', true).order('dock_no', { ascending: true }); if (data) setMasterDocksList(data); };
  const fetchAllDocksForAdmin = async () => { const { data } = await supabase.from('master_docks').select('*').order('dock_no', { ascending: true }); if (data) setAllDocksList(data); };

  const handleToggleDockActive = async (dockNo: string, currentActive: boolean) => {
    try {
      await supabase.from('master_docks').update({ is_active: !currentActive }).eq('dock_no', dockNo);
      fetchAllDocksForAdmin();
      fetchMasterDocksList();
    } catch (e) { alert('❌ เกิดข้อผิดพลาด อาจต้องตรวจสอบคอลัมน์ is_active ในฐานข้อมูล'); }
  };
  
  const fetchOutboundJobs = async () => {
    const startOfDay = `${filterDate}T00:00:00.000Z`; 
    const endOfDay = `${filterDate}T23:59:59.999Z`;
    const { data } = await supabase.from('outbound_jobs').select('*').gte('on_dock_time', startOfDay).lte('on_dock_time', endOfDay).order('on_dock_time', { ascending: true });
    if (data) setOutboundJobs(data);
  };

  const fetchWaitingJobs = async () => {
    const { data, error } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).neq('status', 'Finish').order('check_in_time', { ascending: true });
    if (error || !data) return;
    let filtered = data;
    if (currentView === 'receiver' && receiverDC) {
      filtered = data.filter((job) => {
        const q = job.queue_number || ''; const match = q.match(/\((.*)\)/);
        if (match) { const routeParts = match[1].split(' -> '); return routeParts[routeParts.length - 1] === receiverDC; } else { const dcNum = receiverDC === 'DC7.2' ? '7' : receiverDC.replace('DC', ''); return q.startsWith(`${dcNum}-`); }
      });
    }
    setWaitingJobs(filtered);
  };

  const fetchDriverJob = async () => {
    if (!driverJobData) return;
    const { data } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).eq('daily_plan_id', driverJobData.daily_plan_id).neq('status', 'Finish').order('check_in_time', { ascending: false }).limit(1).single();
    if (data) { 
      setDriverJobData(data); 
    } else { 
      alert('🏁 งานของคุณเสร็จสิ้นครบทุกคลังเรียบร้อยแล้ว!'); 
      handleLogout(); 
    }
  };

  const fetchYardOrders = async () => {
    if (currentView !== 'yard') return; const { data, error } = await supabase.from('orders').select(`*, companies(*)`).eq('status', 'pending').order('created_at', { ascending: false }); if (data && !error) setYardOrders(data);
  };

  const fetchShuntOrders = async () => {
    if (currentView !== 'shunt' || !shuntCompany) return;
    if (shuntCompany === 'FOREMAN') return;
    
    const comp = companiesList.find((c) => {
      const str = JSON.stringify(c).toLowerCase();
      if (shuntCompany === 'PRT') return str.includes('prt') || str.includes('พรอรุณ');
      if (shuntCompany === 'VCG') return str.includes('vcg') || str.includes('คาร์โก้');
      return str.includes(shuntCompany.toLowerCase());
    });
    let query = supabase.from('orders').select('*, companies(*)').eq('status', 'pending').order('created_at', { ascending: true });
    if (comp) {
      query = query.eq('company_id', comp.id);
      const { data, error } = await query;
      if (data && !error) setShuntOrders(data);
    } else {
      const { data, error } = await query;
      if (data && !error) {
        setShuntOrders(data.filter((o) => {
          const cName = (o.companies?.name || o.companies?.code || o.companies?.company_name || '').toLowerCase();
          if (shuntCompany === 'PRT') return cName.includes('prt') || cName.includes('พรอรุณ');
          if (shuntCompany === 'VCG') return cName.includes('vcg') || cName.includes('คาร์โก้');
          return false;
        }));
      }
    }
  };

  useEffect(() => {
    fetchCompanies();
    if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); fetchAllDocksForAdmin(); fetchOutboundJobs(); }
    if (currentView === 'receiver' || currentView === 'unloader') fetchWaitingJobs();
    if (currentView === 'driver') fetchDriverJob();
    if (currentView === 'yard') { fetchYardOrders(); fetchMasterDocksList(); fetchAllDocksForAdmin(); fetchOutboundJobs(); }
    if (currentView === 'shunt') { fetchShuntOrders(); fetchMasterDocksList(); fetchOutboundJobs(); }
    const timer = setInterval(() => {
      if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); fetchAllDocksForAdmin(); fetchOutboundJobs(); }
      if (currentView === 'receiver' || currentView === 'unloader') fetchWaitingJobs();
      if (currentView === 'driver') fetchDriverJob();
      if (currentView === 'yard') { fetchYardOrders(); fetchMasterDocksList(); fetchAllDocksForAdmin(); fetchOutboundJobs(); }
      if (currentView === 'shunt') { fetchShuntOrders(); fetchMasterDocksList(); fetchOutboundJobs(); }
    }, 3000);
    return () => clearInterval(timer);
  }, [currentView, receiverDC, driverJobData, shuntCompany, filterDate]);

  useEffect(() => {
    if (currentView !== 'admin' || adminTab !== 'dockutil') return;
    const fetchDockUtilData = async () => {
      setDockUtilLoading(true);
      const ds = `${dockUtilDate}T00:00:00.000Z`;
      const de = `${dockUtilDate}T23:59:59.999Z`;
      try {
        const { data: inb } = await supabase.from('backhaul_jobs')
          .select('dock_number, call_time, on_dock_time, finish_time, status')
          .not('call_time', 'is', null).lte('call_time', de)
          .or(`finish_time.gte.${ds},finish_time.is.null`);
        const { data: outb } = await supabase.from('outbound_jobs')
          .select('dock_number, on_dock_time, off_dock_time')
          .not('on_dock_time', 'is', null).lte('on_dock_time', de)
          .or(`off_dock_time.gte.${ds},off_dock_time.is.null`);
        setDockUtilInbound(inb || []);
        setDockUtilOutbound(outb || []);
      } catch (e) { setDockUtilInbound([]); setDockUtilOutbound([]); }
      finally { setDockUtilLoading(false); }
    };
    fetchDockUtilData();
  }, [currentView, adminTab, dockUtilDate]);

  useEffect(() => {
    if (currentView === 'driver' && driverJobData) {
      const currentStat = driverJobData.status;
      if (currentStat !== lastAlertStatus) {
        if (currentStat === 'Assigned') playAlertSound('assign');
        else if (currentStat === 'End Load') playAlertSound('endload');
        setLastAlertStatus(currentStat);
      }
    }
  }, [currentView, driverJobData, lastAlertStatus]);

  const handleExportCSV = () => { /* ... Export ... */ };
  const handleExportDockCSV = () => { /* ... Export ... */ };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); const user = username.toLowerCase().trim(); const pass = password.trim();
    if (user === 'admin' && pass === '1234') { setCurrentView('admin'); setUsername(''); setPassword(''); }
    else if (user === 'admintpt' && pass === '1234') { setCurrentView('yard'); setUsername(''); setPassword(''); }
    else if (user === 'prt' && pass === '1234') { setCurrentView('shunt'); setShuntCompany('PRT'); setUsername(''); setPassword(''); }
    else if (user === 'vcg' && pass === '1234') { setCurrentView('shunt'); setShuntCompany('VCG'); setUsername(''); setPassword(''); }
    else if (user === 'foreman' && pass === '1234') { setCurrentView('shunt'); setShuntCompany('FOREMAN'); setShuntTab('outbound'); setUsername(''); setPassword(''); }
    else if (user === 'dcreceive2' && pass === '1234') { setCurrentView('receiver'); setReceiverDC('DC2'); setUsername(''); setPassword(''); }
    else if (user === 'dcreceive6' && pass === '1234') { setCurrentView('receiver'); setReceiverDC('DC6'); setUsername(''); setPassword(''); }
    else if (user === 'dcreceive7' && pass === '1234') { setCurrentView('receiver'); setReceiverDC('DC7.2'); setUsername(''); setPassword(''); }
    else if (user === 'tsw' && pass === '1234') { setCurrentView('unloader'); setUsername(''); setPassword(''); }
    else {
      const inputDigits = user.replace(/\D/g, ''); const passDigits = pass.replace(/\D/g, '');
      if (inputDigits && inputDigits === passDigits) {
        const { data } = await supabase.from('backhaul_jobs').select(`*, daily_plan(*)`).neq('status', 'Finish').order('check_in_time', { ascending: false });
        const matchedJob = data?.find((job) => { const lp = (job.daily_plan?.license_plate || '').replace(/\D/g, ''); const tp = (job.daily_plan?.trailer_plate || '').replace(/\D/g, ''); return (lp && lp === inputDigits) || (tp && tp === inputDigits); });
        if (matchedJob) { setCurrentView('driver'); setDriverJobData(matchedJob); setUsername(''); setPassword(''); } else { alert('❌ รถทะเบียนนี้ยังไม่ Check In หรือเข้าครบทุกคลังแล้ว (รหัสไม่ถูกต้อง)'); }
      } else { alert('❌ ชื่อผู้ใช้ หรือ รหัสผ่านไม่ถูกต้อง!'); }
    }
  };

  const handleLogout = () => { setCurrentView('login'); setReceiverDC(''); setDriverJobData(null); setShuntCompany(''); setCheckInModal(null); setPlanSearchQuery(''); setLastAlertStatus(''); setShuntTab('tasks'); };

  const handleSubmitOutboundDock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outboundModal) return;
    const { dockNo, containerNo, carrier } = outboundModal;
    if (!containerNo || !carrier) { alert('กรุณากรอกทะเบียนตู้และเลือกบริษัทขนส่งให้ครบถ้วน'); return; }
    
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const displayPlate = `${containerNo.toUpperCase()} (${carrier})`;
      
      await supabase.from('outbound_jobs').insert([{ dock_number: dockNo, container_no: containerNo.toUpperCase(), carrier: carrier, on_dock_time: now, status: 'On Dock' }]);
      await supabase.from('master_docks').update({ status: 'Occupied', current_plate: displayPlate }).eq('dock_no', dockNo);
      
      alert(`✅ บันทึกตู้ ${containerNo} เข้าประตู ${dockNo} สำเร็จ!`);
      setOutboundModal(null);
      fetchMasterDocksList();
      fetchOutboundJobs(); 
    } catch (error) { alert('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล'); }
    setLoading(false);
  };

  const handleClearOutboundDock = async (dockNo: string) => {
    const confirmClear = window.confirm(`คุณต้องการเคลียร์รถออกจากประตู [ ${dockNo} ] ใช่หรือไม่?`);
    if (!confirmClear) return;
    try {
      await supabase.from('outbound_jobs').update({ off_dock_time: new Date().toISOString() }).eq('dock_number', dockNo).is('off_dock_time', null);
      await supabase.from('master_docks').update({ status: 'Available', current_plate: null, current_job_id: null }).eq('dock_no', dockNo);
      fetchMasterDocksList();
    } catch (error) { alert('❌ เกิดข้อผิดพลาด'); }
  };

  const handleDropLan = async () => {
    if (!dropModal) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      setOutboundJobs(prev => prev.map(job => (job.dock_number === dropModal.dockNo && !job.off_dock_time) ? { ...job, status: 'Dropped', off_dock_time: now } : job));
      
      await supabase.from('outbound_jobs').update({ status: 'Dropped', off_dock_time: now }).eq('dock_number', dropModal.dockNo).is('off_dock_time', null);
      await supabase.from('master_docks').update({ status: 'Available', current_plate: null, current_job_id: null }).eq('dock_no', dropModal.dockNo);
      setDropModal(null);
      fetchMasterDocksList();
      alert(`✅ Drop ลานสำเร็จ ประตู ${dropModal.dockNo} ว่างแล้ว`);
    } catch (error) { alert('❌ เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const handleCreateYardOrder = async (e: React.FormEvent) => {
    e.preventDefault(); if (!yardCompanyId || !yardContainerNo || !yardOrigin || !yardDestination) { alert('กรุณาระบุข้อมูลให้ครบถ้วน'); return; }
    try {
      const { data: occupiedDock } = await supabase.from('master_docks').select('status, current_plate').eq('dock_no', yardDestination.trim()).eq('status', 'Occupied').single();
      if (occupiedDock) { const confirmTransfer = window.confirm(`⚠️ แจ้งเตือน: ช่องจอด [ ${yardDestination} ] ไม่ว่าง!\n\nตอนนี้มีรถฝั่ง Inbound (ทะเบียน: ${occupiedDock.current_plate || '-'}) จอดทำงานอยู่\n\nคุณแน่ใจหรือไม่ที่จะดึงดันสั่งงานลากตู้ไปที่ประตูดังกล่าว?`); if (!confirmTransfer) return; }
    } catch (error) {}
    setLoading(true);
    try {
      const { error } = await supabase.from('orders').insert([{ company_id: yardCompanyId, container_no: yardContainerNo.toUpperCase(), origin: yardOrigin.toUpperCase(), destination: yardDestination.toUpperCase(), status: 'pending', }]);
      if (error) throw error; alert(`✅ สั่งลากตู้สำเร็จ!`); setYardContainerNo(''); setYardOrigin(''); setYardDestination(''); setYardCompanyId(''); fetchYardOrders();
    } catch (error: any) { alert(`❌ เกิดข้อผิดพลาด: ${error.message}`); } finally { setLoading(false); }
  };

  const handleSubmitMoveOrder = async () => {
    if (!moveModal) return;
    const { originDock, containerNo, carrier, destDock } = moveModal;
    if (!destDock) { alert('กรุณาเลือกประตูปลายทาง'); return; }
    setLoading(true);
    try {
      const carrierU = (carrier || '').toUpperCase();
      const matched = companiesList.find((c) => {
        const name = `${c.name || ''} ${c.code || ''} ${c.company_name || ''}`.toUpperCase();
        if (carrierU.includes('VCG')) return name.includes('VCG') || name.includes('คาร์โก้');
        if (carrierU.includes('PRT')) return name.includes('PRT') || name.includes('พรอรุณ');
        return false;
      });
      const { error } = await supabase.from('orders').insert([{ company_id: matched ? matched.id : null, container_no: (containerNo || '').toUpperCase(), origin: originDock.toUpperCase(), destination: destDock.toUpperCase(), status: 'pending', }]);
      if (error) throw error;
      
      setOutboundJobs(prev => prev.map(job => (job.dock_number === originDock && !job.off_dock_time) ? { ...job, status: 'Moving' } : job));
      await supabase.from('outbound_jobs').update({ status: 'Moving' }).eq('dock_number', originDock).is('off_dock_time', null);
      
      alert(`✅ สั่งย้ายตู้จากประตู ${originDock} ไป ${destDock} สำเร็จ!`);
      setMoveModal(null);
      fetchYardOrders();
    } catch (error: any) { alert(`❌ เกิดข้อผิดพลาด: ${error.message}`); } finally { setLoading(false); }
  };

  const renderDestinationPicker = () => {
    const docks = masterDocksList.filter((d) => d.allowed_type === 'Outbound' || d.allowed_type === 'Both');
    const grouped = docks.reduce((acc: any, d: any) => { if (!acc[d.physical_dc]) acc[d.physical_dc] = []; acc[d.physical_dc].push(d); return acc; }, {} as any);
    return Object.keys(grouped).sort().map((dc) => (
      <div key={dc} style={{ marginBottom: '15px' }}>
        <h4 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', margin: '0 0 10px 0', fontSize: '15px', color: '#334155' }}>📍 คลัง {dc}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {grouped[dc].map((d: any) => {
            const occ = d.status === 'Occupied';
            const selectable = !occ;
            const selected = moveModal?.destDock === d.dock_no;
            return (
              <button key={d.id} type="button" disabled={!selectable}
                onClick={() => selectable && setMoveModal({ ...moveModal, destDock: d.dock_no })}
                style={{ width: '70px', height: '70px', backgroundColor: getDockColor(d), color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: selected ? '4px solid #111827' : 'none', opacity: selectable ? 1 : 0.5, cursor: selectable ? 'pointer' : 'not-allowed', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.1)', padding: '4px' }}>
                <span style={{ fontSize: '16px', fontWeight: '900' }}>{d.dock_no}</span>
                {occ && (<span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.25)', padding: '1px 3px', borderRadius: '3px', marginTop: '2px', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.current_plate || 'มีรถ'}</span>)}
              </button>
            );
          })}
        </div>
      </div>
    ));
  };

  const handleCompleteShuntOrder = async (orderId: string, containerNo: string, destination: string, origin: string) => {
    try {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);

      const originDock = (origin || '').trim();
      const destDock = (destination || '').trim();
      const { data: fromDock } = await supabase.from('master_docks').select('id, current_plate').eq('dock_no', originDock).maybeSingle();
      const { data: toDock } = await supabase.from('master_docks').select('id').eq('dock_no', destDock).maybeSingle();
      
      const movingPlate = fromDock?.current_plate || (containerNo ? containerNo.toUpperCase() : null);
      if (toDock) {
        await supabase.from('master_docks').update({ status: 'Occupied', current_plate: movingPlate }).eq('dock_no', destDock);
        const mc = (movingPlate || '').match(/\(([^)]*)\)/);
        await supabase.from('outbound_jobs').insert([{ dock_number: destDock, container_no: (containerNo || '').toUpperCase(), carrier: mc ? mc[1].trim() : '', on_dock_time: new Date().toISOString(), status: 'On Dock' }]);
      }
      if (fromDock) {
        await supabase.from('master_docks').update({ status: 'Available', current_plate: null, current_job_id: null }).eq('dock_no', originDock);
        await supabase.from('outbound_jobs').update({ off_dock_time: new Date().toISOString() }).eq('dock_number', originDock).is('off_dock_time', null);
      }

      const { data: bJobsIn } = await supabase.from('backhaul_jobs').select('*, daily_plan(*)').eq('status', 'Assigned').like('dock_number', `%${destination}%`);
      if (bJobsIn && bJobsIn.length > 0) { const matchingJob = bJobsIn.find((job) => { const tp = job.daily_plan?.trailer_plate || job.daily_plan?.license_plate || ''; return tp === containerNo; }); if (matchingJob) await executeStatusUpdate(matchingJob.id, { status: 'On Dock', on_dock_time: new Date().toISOString() }); }
      if (destination === 'ตู้เปล่า') {
        const { data: bJobsOut } = await supabase.from('backhaul_jobs').select('*, daily_plan(*)').eq('status', 'End Load').like('dock_number', `%${origin}%`);
        if (bJobsOut && bJobsOut.length > 0) { const matchingJobOut = bJobsOut.find((job) => { const tp = job.daily_plan?.trailer_plate || job.daily_plan?.license_plate || ''; return tp === containerNo; }); if (matchingJobOut) await executeStatusUpdate(matchingJobOut.id, { status: 'Off Dock', finish_time: new Date().toISOString() }); }
      }
      fetchShuntOrders();
      fetchMasterDocksList();
      fetchOutboundJobs(); 
    } catch (error) { alert('❌ เกิดข้อผิดพลาด'); }
  };

  const handleSavePlan = async (e: React.FormEvent) => { /* ... */ e.preventDefault(); };
  const handleCancelPlan = async (id: string) => { /* ... */ };
  const handleCheckIn = async () => { /* ... */ };
  const executeStatusUpdate = async (jobId: string, updateData: any) => { /* ... */ };
  const releaseDocks = async (jobId: string) => { /* ... */ };
  const handleUpdateStatus = async (job: any, currentStatus: string) => { /* ... */ };
  const handleConfirmDock = async () => { /* ... */ };
  const handleMultiDropChoice = async (choice: 'yes' | 'no', nextDC?: string) => { /* ... */ };
  const handleRollbackStatus = async (jobId: string, currentStatus: string) => { /* ... */ };
  
  const renderActionButton = (job: any) => {
    if (job.status === 'Finish') {
      let durationText = '';
      if (job.on_dock_time && (job.end_load_time || job.finish_time)) {
          const endTime = job.end_load_time || job.finish_time;
          const diffMins = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(job.on_dock_time).getTime()) / 60000));
          durationText = `⏱️ ใช้เวลา ${diffMins} นาที`;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✅ เสร็จสิ้น</span>
          {durationText && <span style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{durationText}</span>}
        </div>
      );
    }
    let btnText = ''; let btnClass = ''; const activeStatus = job.status === 'Waiting Unload' ? 'Call Up' : job.status;
    switch (activeStatus) { case 'Call Up': btnText = '📢 Assign Dock'; btnClass = 'call-up'; break; case 'Assigned': btnText = '🚚 รถเข้า Dock'; btnClass = 'assigned'; break; case 'On Dock': btnText = '📦 เริ่มลงสินค้า'; btnClass = 'on-dock'; break; case 'Unloading': btnText = '✅ ลงสินค้าจบ'; btnClass = 'unloading'; break; case 'End Load': btnText = '🔙 รถถอยออกจาก Dock'; btnClass = 'end-load'; break; case 'Off Dock': btnText = '🏁 จบงาน Check Out'; btnClass = 'off-dock'; break; default: return <span>-</span>; }
    return (
      <div className="action-stack">
        <button className={`btn-action ${btnClass}`} onClick={() => handleUpdateStatus(job, activeStatus)}> {btnText} </button>
        {currentView === 'admin' && activeStatus !== 'Call Up' && (<button className="btn-rollback" onClick={() => handleRollbackStatus(job.id, activeStatus)}> ⏪ Undo </button>)}
      </div>
    );
  };

  const getDisplayPlate = (plan: any) => { if (!plan) return '-'; if (plan.transport_type === 'T18W') return plan.trailer_plate || '-'; if (plan.transport_type === 'T6WT' || plan.transport_type === 'T10WT') return `${plan.license_plate || '-'} / ${plan.trailer_plate || '-'}`; return plan.license_plate || '-'; };
  const displayQueue = (q: string | null) => !q || q.includes('VIP') ? '-' : q.split(' (')[0];
  const getShortQueue = (q: string | null) => { if (!q) return '-'; const baseQ = q.split(' (')[0]; return baseQ.includes('VIP') ? '-' : baseQ.split('-')[2] || baseQ; };
  const getDCRoute = (q: string | null) => { if (!q) return '-'; const match = q.match(/\((.*)\)/); return match ? match[1] : q.startsWith('2-') ? 'DC2' : q.startsWith('6-') ? 'DC6' : 'DC7.2'; };
  const getDCFromQueue = (q: string | null) => { if (!q) return '-'; const match = q.match(/\((.*)\)/); if (match) { const r = match[1].split(' -> '); return r[r.length - 1]; } return q.startsWith('2-') ? 'DC2' : q.startsWith('6-') ? 'DC6' : 'DC7.2'; };
  
  const isPlanCheckedIn = (plan: any) => { return plan.backhaul_jobs && Array.isArray(plan.backhaul_jobs) && plan.backhaul_jobs.length > 0; };
  const getPlanActiveStatus = (plan: any) => {
    if (!plan.backhaul_jobs || !Array.isArray(plan.backhaul_jobs) || plan.backhaul_jobs.length === 0) return null;
    const activeJob = plan.backhaul_jobs.find((j: any) => j.status !== 'Finish');
    if (activeJob) return activeJob.status;
    return 'Finish';
  };

  const filteredPlans = dailyPlans.filter((p) => { 
    if (!planSearchQuery) return true; 
    const q = planSearchQuery.toLowerCase(); 
    return ( 
      p.license_plate?.toLowerCase().includes(q) || p.vendor_name?.toLowerCase().includes(q) || p.vendor_code?.toLowerCase().includes(q) || p.job_no?.toLowerCase().includes(q) || p.transport_company?.toLowerCase().includes(q) || p.driver_name?.toLowerCase().includes(q)
    ); 
  });

  const getExecDashboardKPIs = () => {
    const dailyPlansToday = dailyPlans.filter(p => true);
    const uniquePlansCheckIn = new Set(allJobs.map(j => j.daily_plan_id));
    const totalPlan = dailyPlansToday.length;
    const totalCheckIn = uniquePlansCheckIn.size;
    const notArrived = Math.max(0, totalPlan - totalCheckIn);
    
    const countDirect = dailyPlansToday.filter(p => p.subjobtype === 'BH01').length;

    let countWait = 0, countOnDock = 0, countUnload = 0, countFinished = 0;
    let sumWaitTime = 0, countWaitTime = 0;
    let sumLoadTime = 0, countLoadTime = 0;

    const dcStats: any = {};
    MASTER_DCS.forEach(dc => dcStats[dc] = { waitSum: 0, waitCount: 0, loadSum: 0, loadCount: 0 });

    allJobs.forEach((job) => {
      const dc = getDCFromQueue(job.queue_number);
      if (job.call_time && job.check_in_time) {
        const waitMins = (new Date(job.call_time).getTime() - new Date(job.check_in_time).getTime()) / 60000;
        if (waitMins >= 0) { 
          sumWaitTime += waitMins; countWaitTime++; 
          if(dcStats[dc]) { dcStats[dc].waitSum += waitMins; dcStats[dc].waitCount++; }
        }
      }
      if (job.finish_time && job.on_dock_time) {
        const loadMins = (new Date(job.finish_time).getTime() - new Date(job.on_dock_time).getTime()) / 60000;
        if (loadMins >= 0) { 
          sumLoadTime += loadMins; countLoadTime++; 
          if(dcStats[dc]) { dcStats[dc].loadSum += loadMins; dcStats[dc].loadCount++; }
        }
      }
    });

    const latestJobs = Object.values(allJobs.reduce((acc: any, job: any) => { acc[job.daily_plan_id] = job; return acc; }, {}));
    latestJobs.forEach((job: any) => {
      if (job.status === 'Call Up' || job.status === 'Assigned') countWait++;
      else if (job.status === 'On Dock') countOnDock++;
      else if (job.status === 'Unloading') countUnload++;
      else if (job.status === 'Finish' || job.status === 'End Load' || job.status === 'Off Dock') countFinished++;
    });

    const totalActiveStatuses = countWait + countOnDock + countUnload + countFinished;
    const toPercent = (count: number) => totalActiveStatuses > 0 ? ((count / totalActiveStatuses) * 100).toFixed(1) : '0.0';

    return {
      totalPlan, totalCheckIn, notArrived, countDirect,
      countWait, pctWait: toPercent(countWait),
      countOnDock, pctOnDock: toPercent(countOnDock),
      countUnload, pctUnload: toPercent(countUnload),
      countFinished, pctFinished: toPercent(countFinished),
      avgWaitOverall: countWaitTime > 0 ? (sumWaitTime / countWaitTime).toFixed(0) : '0',
      avgLoadOverall: countLoadTime > 0 ? (sumLoadTime / countLoadTime).toFixed(0) : '0',
      dcStats
    };
  };

  const getDockUtilization = () => { /* ... */ return {}; };
  const getWait = (dc: string) => { const s = execData.dcStats?.[dc]; return s && s.waitCount > 0 ? (s.waitSum / s.waitCount).toFixed(0) : '0'; };
  const getLoad = (dc: string) => { const s = execData.dcStats?.[dc]; return s && s.loadCount > 0 ? (s.loadSum / s.loadCount).toFixed(0) : '0'; };
  const getCompanyName = (companies: any, companyId?: string) => {
    if (companies) return companies.name || companies.code || companies.company_name || '-';
    const found = companiesList.find((c) => c.id === companyId);
    return found ? (found.name || found.code || found.company_name || '-') : '-';
  };
  const isMultiDrop = !!(driverJobData?.queue_number && /\(.*\)/.test(driverJobData.queue_number));
  const currentTargetDC = getDCFromQueue(driverJobData?.queue_number);

  const renderHeatmap = () => {
    const inboundDocks = masterDocksList.filter(dock => dock.allowed_type === 'Inbound' || dock.allowed_type === 'Both');
    const grouped = inboundDocks.reduce((acc, dock) => { 
      if (!acc[dock.physical_dc]) acc[dock.physical_dc] = []; 
      acc[dock.physical_dc].push(dock); 
      return acc; 
    }, {} as any);

    return Object.keys(grouped).sort().map((dc) => (
      <div key={dc} style={{ marginBottom: '25px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', }}>
        <h4 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginTop: 0, fontSize: '18px', color: '#334155', }}>📍 คลัง {dc}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '15px', }}>
          {grouped[dc].map((dock: any) => {
            const isOccupied = dock.status === 'Occupied'; 
            const color = isOccupied ? '#ef4444' : '#22c55e';
            return (
              <div key={dock.id} title={`ประตู ${dock.dock_no} - ${dock.status}`} style={{ width: '65px', height: '65px', backgroundColor: color, color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.1)', }}>
                <span style={{ fontSize: '18px', fontWeight: '900' }}> {dock.dock_no} </span>
                {isOccupied && ( <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.25)', padding: '2px 4px', borderRadius: '4px', marginTop: '3px', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', }} > {dock.current_plate || 'มีรถ'} </span> )}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  const getDockColor = (dock: any) => {
    if (dock.status !== 'Occupied') return '#22c55e';
    const p = (dock.current_plate || '').toUpperCase();
    if (p.includes('VCG') || p.includes('คาร์โก้')) return '#2563eb';
    if (p.includes('PRT') || p.includes('พรอรุณ')) return '#f97316';
    return '#9ca3af';
  };

  // 💡 โค้ดเรนเดอร์แผนผังแบบ "ปลดล็อคให้กดได้ถูก Role"
  const renderOutboundHeatmap = (role: 'admin' | 'shunt' | 'tpt') => {
    const outboundDocks = masterDocksList.filter(dock => dock.allowed_type === 'Outbound' || dock.allowed_type === 'Both');
    const grouped = outboundDocks.reduce((acc, dock) => { if (!acc[dock.physical_dc]) acc[dock.physical_dc] = []; acc[dock.physical_dc].push(dock); return acc; }, {} as any);

    const legendDot = (c: string) => ({ display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', backgroundColor: c, marginRight: '5px', verticalAlign: 'middle' });

    return (
      <>
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '15px', fontSize: '13px', color: '#475569' }}>
          <span><span style={legendDot('#22c55e')} />ว่าง</span>
          <span><span style={legendDot('#2563eb')} />VCG</span>
          <span><span style={legendDot('#f97316')} />PRT</span>
          <span><span style={legendDot('#f59e0b')} />กำลังย้าย</span>
          <span><span style={legendDot('#9ca3af')} />อื่นๆ</span>
        </div>
        {Object.keys(grouped).sort().map((dc) => (
          <div key={dc} style={{ marginBottom: '25px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h4 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginTop: 0, fontSize: '18px', color: '#334155' }}>📍 คลัง {dc}</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '15px' }}>
              {grouped[dc].map((dock: any) => {
                const isOccupied = dock.status === 'Occupied'; 
                
                const activeOutbound = outboundJobs.find(j => j.dock_number === dock.dock_no && !j.off_dock_time);
                const isMoving = activeOutbound?.status === 'Moving';

                let color = getDockColor(dock);
                if (isMoving) color = '#f59e0b'; 
                

                let isClickable = false;
                if (role === 'shunt') {
                  if (!isOccupied) {
                    isClickable = true;
                  } else if (isOccupied && !isMoving) {
                    isClickable = true;
                  }
                } else if (role === 'tpt') {
                  isClickable = isOccupied && !isMoving;
                } else if (role === 'admin') {
                  isClickable = isOccupied;
                }

                return (
                  <button 
                    key={dock.id} 
                    onClick={() => {
                      if (role === 'shunt') {
                        if (!isOccupied) {
                          setOutboundModal({ isOpen: true, dockNo: dock.dock_no, containerNo: '', carrier: (shuntCompany === 'PRT' || shuntCompany === 'VCG') ? shuntCompany : '' });
                        } else if (isOccupied && !isMoving) {
                          // ดึงเลขตู้+บริษัท ออกมาจาก current_plate
                          const m = (dock.current_plate || '').match(/^(.*?)\s*\((.*)\)\s*$/);
                          const containerNo = m ? m[1].trim() : (dock.current_plate || '');
                          const carrier = m ? m[2].trim() : '';

                          if (shuntCompany === 'FOREMAN') {
                            setDropModal({ isOpen: true, dockNo: dock.dock_no, containerNo, carrier });
                          } else {
                            setMoveModal({ isOpen: true, originDock: dock.dock_no, containerNo, carrier, destDock: '' });
                          }
                        }
                      } else if (role === 'tpt' && isOccupied && !isMoving) {
                        const m = (dock.current_plate || '').match(/^(.*?)\s*\((.*)\)\s*$/);
                        setMoveModal({ isOpen: true, originDock: dock.dock_no, containerNo: m ? m[1].trim() : (dock.current_plate || ''), carrier: m ? m[2].trim() : '', destDock: '' });
                      } else if (role === 'admin' && isOccupied) {
                        handleClearOutboundDock(dock.dock_no);
                      }
                    }}
                    disabled={!isClickable}
                    style={{ width: '80px', height: '80px', backgroundColor: color, color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: 'none', cursor: isClickable ? 'pointer' : 'not-allowed', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.1)', padding: '5px' }}
                  >
                    <span style={{ fontSize: '18px', fontWeight: '900' }}> {dock.dock_no} </span>
                    {isOccupied && ( 
                      <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.25)', padding: '2px 4px', borderRadius: '4px', marginTop: '3px', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} > 
                        {isMoving ? '⏳ กำลังย้าย' : (dock.current_plate || 'มีรถ')} 
                      </span> 
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </>
    );
  };

  const renderHourlyOutboundSummary = () => {
    const hourlyData = Array.from({ length: 24 }, () => ({ VCG: 0, PRT: 0, OTHER: 0, total: 0 }));
    let maxCount = 0;

    outboundJobs.forEach(job => {
      if (job.on_dock_time) {
        const hour = new Date(job.on_dock_time).getHours();
        const carrier = (job.carrier || '').toUpperCase();
        
        if (carrier.includes('VCG') || carrier.includes('คาร์โก้')) {
          hourlyData[hour].VCG++;
        } else if (carrier.includes('PRT') || carrier.includes('พรอรุณ')) {
          hourlyData[hour].PRT++;
        } else {
          hourlyData[hour].OTHER++;
        }
        
        hourlyData[hour].total++;
        if (hourlyData[hour].total > maxCount) maxCount = hourlyData[hour].total;
      }
    });

    const maxScale = Math.max(maxCount, 10);

    return (
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>📊 สรุปจำนวนตู้เปล่าเข้า Dock รายชั่วโมง</h4>
          <div style={{ display: 'flex', gap: '15px', fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '14px', height: '14px', background: '#3b82f6', borderRadius: '4px' }}></div> VCG
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '14px', height: '14px', background: '#f97316', borderRadius: '4px' }}></div> PRT
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '14px', height: '14px', background: '#94a3b8', borderRadius: '4px' }}></div> อื่นๆ
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: '800px' }}>
            
            <div style={{ display: 'flex', height: '220px', alignItems: 'flex-end', gap: '4px', borderBottom: '2px solid #cbd5e1', paddingBottom: '2px' }}>
              {hourlyData.map((data, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', background: '#f8fafc', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                  
                  {data.OTHER > 0 && (
                    <div style={{ height: `${(data.OTHER / maxScale) * 100}%`, background: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 'bold', transition: 'height 0.3s ease-in-out' }}>
                      {data.OTHER}
                    </div>
                  )}
                  {data.PRT > 0 && (
                    <div style={{ height: `${(data.PRT / maxScale) * 100}%`, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 'bold', transition: 'height 0.3s ease-in-out' }}>
                      {data.PRT}
                    </div>
                  )}
                  {data.VCG > 0 && (
                    <div style={{ height: `${(data.VCG / maxScale) * 100}%`, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 'bold', transition: 'height 0.3s ease-in-out' }}>
                      {data.VCG}
                    </div>
                  )}
                  
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              {hourlyData.map((_, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  {String(i).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              {hourlyData.map((data, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '15px', fontWeight: '900', color: data.total > 0 ? '#b45309' : '#cbd5e1', background: data.total > 0 ? '#fef3c7' : 'transparent', borderRadius: '4px', padding: '6px 0', border: data.total > 0 ? '1px solid #fde68a' : 'none' }}>
                  {data.total > 0 ? data.total : '-'}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    );
  };

  const fmtDur = (mins: number) => { mins = Math.round(mins); if (mins <= 0) return '-'; if (mins < 60) return `${mins} น.`; const h = Math.floor(mins / 60), m = mins % 60; return `${h} ชม.${m ? ' ' + m + ' น.' : ''}`; };
  const computeDockUtil = () => { /* ... */ return { docks: [], total: 0, usedDocks: 0, avgUtil: 0, idleAvgH: 0, turnaround: 0 }; };
  const renderDockUtilDashboard = () => { return (<div/>); }; 

  if (currentView === 'login') {
    return (
      <div className="container login-container">
        <div className="card login-card">
          <h2>🚚 Truck Management</h2>
          <p className="subtitle"> กรุณาเข้าสู่ระบบเพื่อใช้งาน <br /> <small>(พขร. กรอกตัวเลขทะเบียนรถ ทั้งชื่อผู้ใช้และรหัสผ่าน)</small> </p>
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group"> <label>ชื่อผู้ใช้งาน</label> <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required /> </div>
            <div className="form-group"> <label>รหัสผ่าน</label> <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /> </div>
            <button type="submit" className="btn-login"> เข้าสู่ระบบ </button>
          </form>
        </div>
      </div>
    );
  }

  const execData = getExecDashboardKPIs();
  const utilData = getDockUtilization();

  const totalPlansToday = dailyPlans.length;
  const returnedPlansCount = dailyPlans.filter(p => isPlanCheckedIn(p)).length;
  const notReturnedPlansCount = totalPlansToday - returnedPlansCount;
  const directPlansCount = dailyPlans.filter(p => p.subjobtype === 'BH01').length;
  const outboundDocksCount = masterDocksList.filter(d => d.allowed_type === 'Outbound' || d.allowed_type === 'Both').length;

  return (
    <div className="container">
      <div className="top-bar">
        <span> 👤 เข้าใช้งานโดย:{' '} <strong> {currentView === 'admin' ? 'DC BACKHAUL' : currentView === 'yard' ? 'DC TRANSPORT' : currentView === 'shunt' ? `ShuntTruck (${shuntCompany})` : currentView === 'receiver' ? `DC RECEIVE(${receiverDC})` : currentView === 'unloader' ? 'TSW' : `พขร. ทะเบียน ${getDisplayPlate(driverJobData?.daily_plan)}`} </strong> </span>
        <button className="btn-logout" onClick={handleLogout}> 🚪 ออกจากระบบ </button>
      </div>

      {currentView === 'admin' && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ marginBottom: '20px' }}>🚚 Backhauling (Admin)</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', flexWrap: 'wrap', }}>
            <button onClick={() => setAdminTab('plan')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'plan' ? '#1976d2' : '#f1f5f9', color: adminTab === 'plan' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📑 แผนงาน (Daily Plan) </button>
            <button onClick={() => setAdminTab('dashboard')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'dashboard' ? '#1976d2' : '#f1f5f9', color: adminTab === 'dashboard' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 🚛 รายการรถ Inbound </button>
            <button onClick={() => setAdminTab('utilization')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'utilization' ? '#10b981' : '#f1f5f9', color: adminTab === 'utilization' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📊 Dock Inb.Heatmap </button>
            <button onClick={() => setAdminTab('outbound')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'outbound' ? '#8b5cf6' : '#f1f5f9', color: adminTab === 'outbound' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📦 Dock Outb.Heatmap </button>
            <button onClick={() => setAdminTab('exec')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'exec' ? '#f59e0b' : '#f1f5f9', color: adminTab === 'exec' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📈 Dashboard </button>
          </div>

          {adminTab === 'exec' && (
            <div className="dashboard-card" style={{ background: '#f8fafc', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                 <h3 style={{ margin: 0, color: '#334155' }}>📊 Dashboard (ข้อมูลวันที่ {new Date(filterDate).toLocaleDateString('th-TH')})</h3>
                 <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #1976d2' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>Plan</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.totalPlan} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #10b981' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>Check-In</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.totalCheckIn} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #ef4444' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>Not Return</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.notArrived} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #8b5cf6' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>Direct</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.countDirect} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
              </div>

              <h4 style={{ color: '#334155', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>📍 สถานะรถในคลัง</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>รอลงสินค้า (Wait)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{execData.countWait} คัน</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>On Dock (ยังไม่ลง)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{execData.countOnDock} คัน</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>กำลังลงสินค้า</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8b5cf6' }}>{execData.countUnload} คัน</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>ลงจบ / Check-Out</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{execData.countFinished} คัน</div>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'plan' && (
            <div className="dashboard-card">
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #1976d2', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>Actual Truck</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>{totalPlansToday} <span style={{fontSize:'12px', color:'#94a3b8'}}>คัน</span></div>
                </div>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #10b981', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>Returned</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{returnedPlansCount} <span style={{fontSize:'12px', color:'#94a3b8'}}>คัน</span></div>
                </div>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ef4444', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>Not Return</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{notReturnedPlansCount} <span style={{fontSize:'12px', color:'#94a3b8'}}>คัน</span></div>
                </div>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #8b5cf6', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>Direct</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8b5cf6' }}>{directPlansCount} <span style={{fontSize:'12px', color:'#94a3b8'}}>คัน</span></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px', }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '16px', background: '#fff' }} />
                  <input type="text" placeholder="🔍 ค้นหา Job, VD.Code, ทะเบียนรถ, บริษัทขนส่ง" value={planSearchQuery} onChange={(e) => setPlanSearchQuery(e.target.value)} style={{ padding: '10px', width: '100%', minWidth: '300px', maxWidth: '450px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '16px', }} />
                </div>
                
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-action call-up" style={{ padding: '10px 20px', fontSize: '16px', background: '#475569', color: 'white', border: 'none', }} disabled={loading} > {loading ? '⏳ กำลังนำเข้า...' : '📥 นำเข้าไฟล์ CSV'} </button>
                  <button onClick={() => { setPlanForm({...initialPlanForm, schedule_date: filterDate}); setShowPlanForm(true); }} className="btn-action on-dock" style={{ padding: '10px 20px', fontSize: '16px' }} > ➕ เพิ่มรายการรถ </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead> <tr> <th>บริษัทขนส่ง</th> <th>Job No</th> <th>Vendor</th> <th>ทะเบียนรถ</th> <th>ชื่อ พขร.</th> <th>ประเภท</th> <th>สถานะ</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
                  <tbody>
                    {filteredPlans.length === 0 ? ( <tr> <td colSpan={8} style={{ textAlign: 'center', padding: '20px' }} > ไม่พบข้อมูลแผนงานของวันที่ {new Date(filterDate).toLocaleDateString('th-TH')} </td> </tr> ) : (
                      filteredPlans.map((plan) => {
                        const planStatus = getPlanActiveStatus(plan);
                        
                        return (
                          <tr key={plan.id}>
                            <td style={{ color: '#555', fontWeight: 'bold' }}> {plan.transport_company || '-'} </td>
                            <td>
                              {plan.job_no || '-'}
                              {plan.subjobtype === 'BH01' && <span style={{display: 'inline-block', marginLeft: '8px', background: '#e0e7ff', color: '#4338ca', fontSize: '11px', padding: '2px 6px', borderRadius: '4px'}}>Direct</span>}
                            </td>
                            <td className="vendor-cell"> {plan.vendor_code && ( <span style={{ color: '#64748b', fontSize: '13px', display: 'block', fontWeight: 'normal', }} > [{plan.vendor_code}] </span> )} {plan.vendor_name || '-'} </td>
                            <td style={{ fontWeight: 'bold' }}> {getDisplayPlate(plan)} </td>
                            <td style={{ color: '#0f172a' }}>{plan.driver_name || '-'}</td>
                            <td>{plan.transport_type || '-'}</td>
                            <td> 
                              {planStatus ? ( 
                                <span className={`status-badge ${planStatus.replace(' ', '-')}`} > {planStatus} </span> 
                              ) : ( 
                                <span style={{ color: '#ed6c02', fontWeight: 'bold' }} > ⏳ Pending </span> 
                              )} 
                            </td>
                            <td style={{ textAlign: 'center', width: '250px' }}>
                              {planStatus ? ( 
                                <span style={{ color: '#666', fontWeight: 'bold' }}> 
                                  {planStatus === 'Finish' ? '✅ จบงานแล้ว' : '🚚 อยู่ในลาน'} 
                                </span> 
                              ) : (
                                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', }} >
                                  <button onClick={() => setCheckInModal({ isOpen: true, plan, selectedDC: '', }) } className="btn-action assigned" style={{ padding: '6px 10px', fontSize: '13px', }} > 🟢 Check-In </button>
                                  <button onClick={() => { setPlanForm(plan); setShowPlanForm(true); }} className="btn-action call-up" style={{ padding: '6px 10px', fontSize: '13px', background: '#f59e0b', color: 'white', }} > ✏️ Edit </button>
                                  <button onClick={() => handleCancelPlan(plan.id)} className="btn-rollback" style={{ padding: '6px 10px', fontSize: '13px', }} > ❌ Cancel </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'dashboard' && (
            <div className="dashboard-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px', }}>
                <h3 style={{ margin: 0 }}>📊 BH Truck Inbound</h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
                  <button onClick={handleExportCSV} style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', }} > 📥 ดาวน์โหลดไฟล์ CSV </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead> <tr> <th>เวลา Check In</th> <th>Queue</th> <th>ลงสินค้า</th> <th>ทะเบียนรถ</th> <th>บริษัทขนส่ง</th> <th>ประเภทรถ</th> <th>Vendor</th> <th>Dock (ประวัติ)</th> <th>Status</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
                  <tbody>
                    {(displayJobs as any[]).map((job) => (
                      <tr key={job.id}>
                        <td> {new Date(job.check_in_time).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', })} น. </td>
                        <td> <strong>{displayQueue(job.queue_number)}</strong> </td>
                        <td> <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', }} > {getDCRoute(job.queue_number)} </span> </td>
                        <td>{getDisplayPlate(job.daily_plan)}</td>
                        <td style={{ fontWeight: 'bold', color: '#555' }}> {job.daily_plan?.transport_company || '-'} </td>
                        <td>{job.daily_plan?.transport_type}</td>
                        <td className="vendor-cell"> {job.daily_plan?.vendor_code && ( <span style={{ color: '#64748b', fontSize: '11px', display: 'block', }} > [{job.daily_plan.vendor_code}] </span> )} {job.daily_plan?.vendor_name || '-'} </td>
                        <td> <span className="dock-badge" style={{whiteSpace: 'nowrap'}}> {job.combined_docks.join(' ➡️ ') || '-'} </span> </td>
                        <td> <span className={`status-badge ${job.status.replace( ' ', '-' )}`} > {job.status} </span> </td>
                        <td style={{ textAlign: 'center' }}> {renderActionButton(job)} </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'utilization' && (
            <div className="dashboard-card" style={{ background: '#f8fafc', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#334155' }}> 🏢 Live Inbound Heatmap </h3>
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
              </div>

              <div style={{ marginBottom: '20px', background: 'white', borderRadius: '10px', padding: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <p style={{ margin: '0 0 12px', fontWeight: 'bold', color: '#334155' }}>⚙️ จัดการประตู</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {allDocksList.filter((d: any) => d.allowed_type === 'Inbound' || d.allowed_type === 'Both').map((d: any) => (
                    <button key={d.id} onClick={() => handleToggleDockActive(d.dock_no, d.is_active)}
                      title={d.is_active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: '2px solid', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: d.is_active ? '#dbeafe' : '#f1f5f9', color: d.is_active ? '#1d4ed8' : '#94a3b8', borderColor: d.is_active ? '#1d4ed8' : '#cbd5e1', transition: 'all 0.2s' }}>
                      {d.dock_no} {d.is_active ? '✅' : '❌'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#94a3b8' }}>✅ = Active · ❌ = Inactive</p>
              </div>

              {renderHeatmap()}
            </div>
          )}

          {adminTab === 'outbound' && (
            <div className="dashboard-card" style={{ background: '#f8fafc', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#8b5cf6' }}> 📦 Live Outbound Heatmap </h3>
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
              </div>

              <div style={{ marginBottom: '20px', background: 'white', borderRadius: '10px', padding: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <p style={{ margin: '0 0 12px', fontWeight: 'bold', color: '#334155' }}>⚙️ จัดการประตู</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {allDocksList.filter((d: any) => d.allowed_type === 'Outbound' || d.allowed_type === 'Both').map((d: any) => (
                    <button key={d.id} onClick={() => handleToggleDockActive(d.dock_no, d.is_active)}
                      title={d.is_active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: '2px solid', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: d.is_active ? '#dcfce7' : '#f1f5f9', color: d.is_active ? '#16a34a' : '#94a3b8', borderColor: d.is_active ? '#16a34a' : '#cbd5e1', transition: 'all 0.2s' }}>
                      {d.dock_no} {d.is_active ? '✅' : '❌'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#94a3b8' }}>✅ = Active · ❌ = Inactive</p>
              </div>

              {renderHourlyOutboundSummary()}
              
              {outboundDocksCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontWeight: 'bold' }}>
                  ⚠️ ยังไม่มีประตูใดเป็น Outbound ในฐานข้อมูล
                </div>
              ) : renderOutboundHeatmap('admin')}
            </div>
          )}
        </div>
      )}

      {currentView === 'yard' && (
        <>
          <div className="card">
            <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #eee', paddingBottom: '10px', justifyContent: 'center' }}>
              <button onClick={() => setYardTab('tasks')} style={{ padding: '12px 25px', fontSize: '18px', fontWeight: 'bold', background: yardTab === 'tasks' ? '#1976d2' : '#f1f5f9', color: yardTab === 'tasks' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>🚛 งานลากตู้</button>
              <button onClick={() => setYardTab('outbound')} style={{ padding: '12px 25px', fontSize: '18px', fontWeight: 'bold', background: yardTab === 'outbound' ? '#8b5cf6' : '#f1f5f9', color: yardTab === 'outbound' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>📦 Outbound Heatmap</button>
            </div>
          </div>

          {yardTab === 'tasks' && (<>
          <div className="card">
            <h2>🏗️ Shunt Truck Monitor</h2>
            <form onSubmit={handleCreateYardOrder} style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '15px', }} >
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }} > <label>บริษัท (Carrier)</label> <select value={yardCompanyId} onChange={(e) => setYardCompanyId(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', }} required > <option value="">-- เลือกบริษัท --</option> {companiesList.map((comp) => ( <option key={comp.id} value={comp.id}> {comp.name || comp.code || comp.company_name || 'ไม่ระบุชื่อ'} </option> ))} </select> </div>
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }} > <label>ทะเบียนตู้</label> <input type="text" value={yardContainerNo} onChange={(e) => setYardContainerNo(e.target.value)} required /> </div>
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }} > <label>📍 ต้นทาง</label> <input type="text" value={yardOrigin} onChange={(e) => setYardOrigin(e.target.value)} required /> </div>
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }} > <label>🏁 ปลายทาง</label> <input type="text" value={yardDestination} onChange={(e) => setYardDestination(e.target.value)} required /> </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '15px', }} > <button type="submit" className="btn-action on-dock" style={{ padding: '12px 25px', fontSize: '16px' }} disabled={loading} > {loading ? 'กำลังส่ง...' : '📤 ส่งงาน'} </button> </div>
            </form>
          </div>
          <div className="dashboard-card">
            <h3>📋 รายการงานลากตู้</h3>
            <div className="table-responsive">
              <table className="dashboard-table">
                <thead> <tr> <th>เวลาแจ้ง</th> <th>บริษัท</th> <th>ทะเบียนตู้</th> <th>📍 ต้นทาง</th> <th>🏁 ปลายทาง</th> <th>สถานะงาน</th> </tr> </thead>
                <tbody>
                  {yardOrders.length === 0 ? ( <tr> <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }} > 🎉 ไม่มีคำสั่งค้าง </td> </tr> ) : (
                    yardOrders.map((order) => (
                      <tr key={order.id}>
                        <td> {new Date(order.created_at).toLocaleString('th-TH')} </td>
                        <td> <strong> {getCompanyName(order.companies, order.company_id)} </strong> </td>
                        <td> <strong>{order.container_no}</strong> </td>
                        <td style={{ color: '#1976d2', fontWeight: 'bold' }}> {order.origin} </td>
                        <td style={{ color: '#d32f2f', fontWeight: 'bold' }}> {order.destination} </td>
                        <td> <span className={`status-badge Call-Up`}> รอดำเนินการ </span> </td>
                      </tr>
                    ))
                  )}
                </tbody>
               </table>
            </div>
          </div>
          </>)}

          {yardTab === 'outbound' && (
            <div className="card">
              <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#8b5cf6' }}>📦 Outbound Heatmap</h2>

              <div style={{ marginBottom: '20px', background: '#f8fafc', borderRadius: '10px', padding: '15px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 12px', fontWeight: 'bold', color: '#334155' }}>⚙️ จัดการประตู</p>
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Outbound / Both</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {allDocksList.filter((d: any) => d.allowed_type === 'Outbound' || d.allowed_type === 'Both').map((d: any) => (
                    <button key={d.id} onClick={() => handleToggleDockActive(d.dock_no, d.is_active)}
                      title={d.is_active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: '2px solid', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: d.is_active ? '#dcfce7' : '#f1f5f9', color: d.is_active ? '#16a34a' : '#94a3b8', borderColor: d.is_active ? '#16a34a' : '#cbd5e1', transition: 'all 0.2s' }}>
                      {d.dock_no} {d.is_active ? '✅' : '❌'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Inbound / Both</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {allDocksList.filter((d: any) => d.allowed_type === 'Inbound' || d.allowed_type === 'Both').map((d: any) => (
                    <button key={`inb-${d.id}`} onClick={() => handleToggleDockActive(d.dock_no, d.is_active)}
                      title={d.is_active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: '2px solid', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: d.is_active ? '#dbeafe' : '#f1f5f9', color: d.is_active ? '#1d4ed8' : '#94a3b8', borderColor: d.is_active ? '#1d4ed8' : '#cbd5e1', transition: 'all 0.2s' }}>
                      {d.dock_no} {d.is_active ? '✅' : '❌'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#94a3b8' }}>✅ = Active · ❌ = Inactive</p>
              </div>

              {masterDocksList.length === 0 ? <p style={{ textAlign: 'center' }}>กำลังโหลด...</p> : renderOutboundHeatmap('tpt')}
            </div>
          )}
        </>
      )}

      {currentView === 'shunt' && (
        <div className="card">
          <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#1976d2', }} > 🚛 ทีม {shuntCompany} </h2>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', justifyContent: 'center' }}>
            <button onClick={() => setShuntTab('tasks')} style={{ padding: '12px 25px', fontSize: '18px', fontWeight: 'bold', background: shuntTab === 'tasks' ? '#1976d2' : '#f1f5f9', color: shuntTab === 'tasks' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📋 รายการงานลากตู้ </button>
            <button onClick={() => setShuntTab('outbound')} style={{ padding: '12px 25px', fontSize: '18px', fontWeight: 'bold', background: shuntTab === 'outbound' ? '#8b5cf6' : '#f1f5f9', color: shuntTab === 'outbound' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 🏗️ ตู้เปล่าเข้า Dock </button>
          </div>

          {shuntTab === 'tasks' && (
            <>
              {shuntCompany === 'FOREMAN' ? ( <div className="empty-state">Foreman ไม่มีหน้าที่ลากตู้ กรุณาไปที่แท็บ 'ตู้เปล่าเข้า Dock'</div> ) : shuntOrders.length === 0 ? ( <div className="empty-state">🎉 ไม่มีงานลากตู้ค้าง</div> ) : (
                <div className="table-responsive">
                  <table className="receiver-table">
                    <thead> <tr> <th>เวลาแจ้ง</th> <th>ทะเบียนตู้</th> <th>📍 ต้นทาง</th> <th>🏁 ปลายทาง</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
                    <tbody>
                      {shuntOrders.map((order) => (
                        <tr key={order.id}>
                          <td style={{ color: '#666', fontSize: '13px' }}> {new Date(order.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', })} น. </td>
                          <td style={{ fontSize: '18px', fontWeight: '900', color: '#1976d2', }} > {order.container_no} </td>
                          <td style={{ fontSize: '16px', fontWeight: 'bold', color: '#d32f2f', }} > {order.origin} </td>
                          <td style={{ fontSize: '16px', fontWeight: 'bold', color: '#2e7d32', }} > {order.destination} </td>
                          <td style={{ textAlign: 'center', width: '120px' }}> <button className="btn-action assigned" onClick={() => handleCompleteShuntOrder( order.id, order.container_no, order.destination, order.origin ) } > ✅ เสร็จ </button> </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {shuntTab === 'outbound' && (
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#334155', textAlign: 'center' }}>เลือกประตู Drop ตู้</h3>
              {outboundDocksCount === 0 ? ( <div style={{ textAlign: 'center', padding: '40px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontWeight: 'bold' }}>⚠️ ยังไม่มีประตูใดเป็น Outbound ในฐานข้อมูล</div> ) : renderOutboundHeatmap('shunt')}
            </div>
          )}
        </div>
      )}
      
      {outboundModal && outboundModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ fontSize: '22px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}> 🏗️ ตู้เข้าประตู {outboundModal.dockNo} </h3>
            <form onSubmit={handleSubmitOutboundDock} style={{ marginTop: '20px' }}>
              <div className="form-group">
                <label>เลขทะเบียนตู้เปล่า *</label>
                <input type="text" required autoFocus placeholder="เช่น TLLU123456" value={outboundModal.containerNo} onChange={(e) => setOutboundModal({ ...outboundModal, containerNo: e.target.value })} style={{ fontSize: '18px', padding: '12px' }} />
              </div>
              <div className="form-group" style={{ marginTop: '15px' }}>
                <label>บริษัทขนส่ง *</label>
                {shuntCompany === 'FOREMAN' ? (
                  <select required value={outboundModal.carrier} onChange={(e) => setOutboundModal({ ...outboundModal, carrier: e.target.value })} style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '6px' }}>
                    <option value="">-- เลือกบริษัท --</option>
                    <option value="PRT">PRT</option>
                    <option value="VCG">VCG</option>
                  </select>
                ) : (
                  <input type="text" disabled value={outboundModal.carrier} style={{ background: '#e2e8f0', fontWeight: 'bold', fontSize: '16px', padding: '12px' }} />
                )}
              </div>
              <div className="modal-buttons" style={{ marginTop: '25px' }}>
                <button type="submit" className="btn-action on-dock" disabled={loading} style={{ padding: '12px 20px', fontSize: '18px' }} > {loading ? 'กำลังบันทึก...' : '✅ ยืนยัน'} </button>
                <button type="button" className="btn-rollback" onClick={() => setOutboundModal(null)} style={{ padding: '12px 20px', fontSize: '18px' }} > ❌ ยกเลิก </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {moveModal && moveModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '22px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}> 🔀 ย้ายตู้จากประตู {moveModal.originDock} </h3>
            <div style={{ background: '#f1f5f9', padding: '12px 15px', borderRadius: '8px', margin: '15px 0', fontSize: '16px' }}>
              <div style={{ marginBottom: '4px' }}><strong>ต้นทาง:</strong> ประตู {moveModal.originDock}</div>
              <div style={{ marginBottom: '4px' }}><strong>ตู้:</strong> {moveModal.containerNo || '-'}</div>
              <div><strong>บริษัท:</strong> {moveModal.carrier || '-'}</div>
            </div>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>เลือกประตูปลายทาง (เลือกได้เฉพาะประตูว่าง) *</label>
            {masterDocksList.length === 0 ? <p style={{ textAlign: 'center' }}>กำลังโหลด...</p> : renderDestinationPicker()}
            <div style={{ textAlign: 'center', margin: '15px 0', fontSize: '16px' }}>
              ปลายทางที่เลือก: <strong style={{ color: '#2563eb' }}>{moveModal.destDock || 'ยังไม่เลือก'}</strong>
            </div>
            <div className="modal-buttons" style={{ marginTop: '10px' }}>
              <button type="button" className="btn-action on-dock" disabled={loading || !moveModal.destDock} onClick={handleSubmitMoveOrder} style={{ padding: '12px 20px', fontSize: '18px' }}> {loading ? 'กำลังส่ง...' : '✅ ยืนยันสั่งย้าย'} </button>
              <button type="button" className="btn-rollback" onClick={() => setMoveModal(null)} style={{ padding: '12px 20px', fontSize: '18px' }}> ❌ ยกเลิก </button>
            </div>
          </div>
        </div>
      )}

      {dropModal && dropModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px', width: '95%' }}>
            <h3 style={{ fontSize: '22px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>🏗️ จัดการประตู {dropModal.dockNo}</h3>
            <div style={{ background: '#f1f5f9', padding: '12px 15px', borderRadius: '8px', margin: '15px 0', fontSize: '16px' }}>
              <div style={{ marginBottom: '4px' }}><strong>ประตู:</strong> {dropModal.dockNo}</div>
              <div style={{ marginBottom: '4px' }}><strong>ตู้:</strong> {dropModal.containerNo || '-'}</div>
              <div><strong>บริษัท:</strong> {dropModal.carrier || '-'}</div>
            </div>
            <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '20px' }}>เลือกการดำเนินการ</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button type="button" disabled={loading}
                onClick={() => { setDropModal(null); const m = `${dropModal.containerNo} (${dropModal.carrier})`; setMoveModal({ isOpen: true, originDock: dropModal.dockNo, containerNo: dropModal.containerNo, carrier: dropModal.carrier, destDock: '' }); }}
                style={{ padding: '15px', fontSize: '18px', fontWeight: 'bold', background: '#1976d2', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                🔀 ย้ายตู้ไปประตูอื่น
              </button>
              <button type="button" disabled={loading}
                onClick={handleDropLan}
                style={{ padding: '15px', fontSize: '18px', fontWeight: 'bold', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                🚛 Drop ลาน (ตู้เต็มออกไปส่งสินค้า)
              </button>
              <button type="button" onClick={() => setDropModal(null)}
                style={{ padding: '12px', fontSize: '16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
                ❌ ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'driver' && driverJobData && (
        <div className="driver-dashboard">
          <div className="card text-center">
            <h2 style={{ fontSize: '24px', marginBottom: '15px' }}> 📱 สถานะคิวงานของคุณ </h2>
            <div className="driver-queue-box">
              <p>หมายเลขคิวของคุณ</p>
               <div className="big-queue"> {getShortQueue(driverJobData.queue_number)} </div>
              {isMultiDrop && ( <div className="multi-drop-alert"> 📍 ลงสินค้าต่อ {currentTargetDC} </div> )}
              <div className="driver-dock"> ช่องจอด (Dock):{' '} <span>{driverJobData.dock_number || 'กำลังรอเรียก...'}</span> </div>
            </div>
            <div className="driver-info-grid">
              <div> <strong>ทะเบียนรถ:</strong>{' '} {getDisplayPlate(driverJobData.daily_plan)} </div>
              <div> <strong>Vendor:</strong> {driverJobData.daily_plan?.vendor_name} </div>
              <div> <strong>สถานะ:</strong>{' '} <span className={`status-badge ${driverJobData.status.replace( ' ', '-' )}`} > {driverJobData.status} </span> </div>
            </div>
            <div className="driver-action-area">
              {driverJobData.status === 'Assigned' && ( <button className="btn-action assigned driver-btn-big" onClick={() => handleUpdateStatus(driverJobData, driverJobData.status) } > 🚚 นำรถเข้า Dock แล้ว </button> )}
              {driverJobData.status === 'End Load' && ( <button className="btn-action end-load driver-btn-big" onClick={() => handleUpdateStatus(driverJobData, driverJobData.status) } > 🔙 ถอยรถออกจาก Dock แล้ว </button> )}
              {(driverJobData.status === 'Waiting Unload' || driverJobData.status === 'Call Up') && ( <div className="driver-wait-msg">รอเรียกเข้าประตู...</div> )}
              {(driverJobData.status === 'On Dock' || driverJobData.status === 'Unloading') && ( <div className="driver-wait-msg">กำลังลงสินค้า</div> )}
              {driverJobData.status === 'Off Dock' && ( <div className="driver-wait-msg"> ติดต่อ BH Team เพื่อ จบงาน </div> )}
             </div>
          </div>
        </div>
      )}

      {currentView === 'receiver' && (
        <div className="card">
          <h2>📦 รอลงสินค้า - คลัง {receiverDC}</h2>
          <div className="table-responsive">
            <table className="receiver-table">
              <thead> <tr> <th>คิว</th> <th>Vendor</th> <th>ทะเบียน</th> <th>บริษัทขนส่ง</th> <th>ประเภทรถ</th> <th>Dock</th> <th>Check In</th> <th>Status</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
              <tbody>
                {waitingJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="queue-cell"> {getShortQueue(job.queue_number)} </td>
                    <td className="vendor-cell"> {job.daily_plan?.vendor_code && ( <span style={{ color: '#64748b', fontSize: '11px', display: 'block', }} > [{job.daily_plan.vendor_code}] </span> )} {job.daily_plan?.vendor_name || '-'} </td>
                    <td>{getDisplayPlate(job.daily_plan)}</td>
                    <td style={{ fontWeight: 'bold', color: '#555' }}> {job.daily_plan?.transport_company || '-'} </td>
                    <td>{job.daily_plan?.transport_type}</td>
                    <td> <span className="dock-badge"> {job.dock_number || '-'} </span> </td>
                    <td> {new Date(job.check_in_time).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', })} น. </td>
                    <td> <span className={`status-badge ${job.status.replace( ' ', '-' )}`} > {job.status} </span> </td>
                    <td style={{ textAlign: 'center', width: '160px' }}> {renderActionButton(job)} </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentView === 'unloader' && (
        <div className="card">
          <h2>📦 Unloading Dashboard (ကုန်ချမည့်စာရင်း)</h2>
          {waitingJobs.length === 0 ? ( <div className="empty-state"> 🎉 No tasks waiting / ကုန်ချရန် မရှိပါ </div> ) : (
            <div className="table-responsive">
              <table className="receiver-table">
                <thead> <tr> <th>DC</th> <th>Dock</th> <th>License</th> <th>Vendor</th> <th>Status</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
                <tbody>
                  {waitingJobs.map((job) => (
                    <tr key={job.id}>
                      <td> <span className="dock-badge" style={{ backgroundColor: '#475569' }} > {getDCFromQueue(job.queue_number)} </span> </td>
                      <td> <span className="dock-badge" style={{ backgroundColor: '#1976d2' }} > {job.dock_number || '-'} </span> </td>
                      <td>{getDisplayPlate(job.daily_plan)}</td>
                      <td className="vendor-cell"> {job.daily_plan?.vendor_code && ( <span style={{ color: '#64748b', fontSize: '11px', display: 'block', }} > [{job.daily_plan.vendor_code}] </span> )} {job.daily_plan?.vendor_name || '-'} </td>
                      <td> <span className={`status-badge ${job.status.replace( ' ', '-' )}`} > {job.status} </span> </td>
                      <td style={{ textAlign: 'center', width: '220px' }}>
                        {job.status === 'On Dock' ? ( <button className="btn-action on-dock" onClick={() => handleUpdateStatus(job, job.status)} > 📦 Start (စတင်ချပါ) </button> ) : job.status === 'Unloading' ? ( <button className="btn-action unloading" onClick={() => handleUpdateStatus(job, job.status)} > ✅ Finish (ပြီးပါပြီ) </button> ) : ( <div className="driver-wait-msg" style={{ fontSize: '13px', padding: '6px', animation: 'none', }} > Waiting (စောင့်ပါ) </div> )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dockModal && dockModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px', width: '95%' }} >
            <h3 style={{ fontSize: '22px', borderBottom: '2px solid #eee', paddingBottom: '10px', }} > 📍 คลัง {getDCRoute(dockModal.job.queue_number)}: เลือกช่องจอดสินค้า </h3>
            <p style={{ fontSize: '16px', color: '#666', marginTop: '10px' }}> รถทะเบียน{' '} <strong>{getDisplayPlate(dockModal.job.daily_plan)}</strong> ( {dockModal.job.daily_plan?.transport_type})<br /> กรุณาจิ้มเลือกประตู{' '} <strong style={{ color: '#d32f2f', fontSize: '18px' }}> {dockModal.requiredCount} </strong>{' '} ช่อง </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px', maxHeight: '400px', overflowY: 'auto', padding: '10px', background: '#f8fafc', borderRadius: '8px', }} >
              {dockModal.docks.length === 0 ? ( <p style={{ color: 'red' }}> ไม่พบประตูที่เปิดใช้งานสำหรับคลังนี้ </p> ) : (
                dockModal.docks.map((dock) => {
                  const isSelected = dockModal.selectedDocks.includes( dock.dock_no ); const isOccupied = dock.status === 'Occupied';
                  return (
                    <button key={dock.id} disabled={isOccupied} onClick={() => { let newSelected = [...dockModal.selectedDocks]; if (isSelected) { newSelected = newSelected.filter( (d) => d !== dock.dock_no ); } else if ( newSelected.length < dockModal.requiredCount ) { newSelected.push(dock.dock_no); } setDockModal({ ...dockModal, selectedDocks: newSelected, }); }} style={{ flex: '1 1 calc(20% - 10px)', minWidth: '90px', padding: '15px 10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: isOccupied ? 'not-allowed' : 'pointer', transition: 'all 0.2s', backgroundColor: isOccupied ? '#ef4444' : isSelected ? '#3b82f6' : '#22c55e', color: 'white', boxShadow: isSelected ? '0 0 0 3px #1d4ed8' : '0 2px 4px rgba(0,0,0,0.1)', opacity: isOccupied ? 0.8 : 1, }} >
                      <div style={{ fontSize: '20px' }}>{dock.dock_no}</div>
                      <div style={{ fontSize: '12px', marginTop: '5px', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px', }} > {isOccupied ? dock.current_plate || 'ไม่ว่าง' : 'ว่าง'} </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="modal-buttons" style={{ marginTop: '25px' }}>
              <button className="btn-action on-dock" onClick={handleConfirmDock} disabled={ dockModal.selectedDocks.length !== dockModal.requiredCount } style={{ padding: '12px 20px', fontSize: '18px', opacity: dockModal.selectedDocks.length !== dockModal.requiredCount ? 0.5 : 1, }} > ✅ ยืนยันช่องจอด </button>
              <button className="btn-rollback" onClick={() => setDockModal(null)} style={{ padding: '12px 20px', fontSize: '18px' }} > ❌ ยกเลิก </button>
            </div>
          </div>
        </div>
      )}

      {multiDropConfig && (
        <div className="modal-overlay">
          <div className="modal-card">
            {multiDropConfig.step === 'ask' ? (
              <>
                 <h3 style={{ fontSize: '22px' }}> ❓ มีงานไปลงคลังอื่นต่อหรือไม่? </h3>
                <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px', }} > (နောက်ထပ်ချစရာရှိသေးလား) </p>
                <div className="modal-buttons">
                  <button className="btn-action on-dock" style={{ padding: '15px', fontSize: '18px' }} onClick={() => setMultiDropConfig({ ...multiDropConfig, step: 'select' }) } > ✅ มี (ရှိသည်) - ไปคลังอื่น </button>
                  <button className="btn-action end-load" style={{ padding: '15px', fontSize: '18px' }} onClick={() => handleMultiDropChoice('no')} > ❌ ไม่มี (မရှိပါ) - จบงาน </button>
                  <button className="btn-rollback" style={{ marginTop: '15px', padding: '10px' }} onClick={() => setMultiDropConfig(null)} > ยกเลิก (Cancel) </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: '22px' }}>📍 เลือก DC ถัดไป</h3>
                <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px', }} > (နောက်ထပ် DC ကိုရွေးပါ) </p>
                <div className="modal-buttons">
                  {MASTER_DCS.map((dc) => ( <button key={dc} className="btn-action call-up" style={{ padding: '15px', fontSize: '18px' }} onClick={() => handleMultiDropChoice('yes', dc)} > 🚚 {dc} </button> ))}
                  <button className="btn-rollback" style={{ marginTop: '15px', padding: '10px' }} onClick={() => setMultiDropConfig(null)} > ย้อนกลับ (Back) </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;