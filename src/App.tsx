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

  const [dockModal, setDockModal] = useState<{ isOpen: boolean; job: any; docks: any[]; selectedDocks: string[]; requiredCount: number } | null>(null);

  const [adminTab, setAdminTab] = useState<'plan' | 'dashboard' | 'utilization' | 'exec'>('plan');
  const [dailyPlans, setDailyPlans] = useState<any[]>([]);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [checkInModal, setCheckInModal] = useState<{ isOpen: boolean; plan: any; selectedDC: string } | null>(null);
  const [masterDocksList, setMasterDocksList] = useState<any[]>([]);

  const initialPlanForm = { id: '', transport_summary_no: '', job_no: '', vendor_code: '', vendor_name: '', transport_type: '', license_plate: '', trailer_plate: '', driver_name: '', transport_company: '', appointment_no: '' };
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState(initialPlanForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').map((row) => row.trim()).filter((row) => row);
        if (rows.length < 2) throw new Error('ไฟล์ว่างเปล่า หรือไม่มีข้อมูล');
        const parseCSVLine = (str: string) => {
          const arr = []; let quote = false; let col = '';
          for (let i = 0; i < str.length; i++) {
            if (str[i] === '"') { quote = !quote; } else if (str[i] === ',' && !quote) { arr.push(col.trim()); col = ''; } else { col += str[i]; }
          }
          arr.push(col.trim()); return arr;
        };
        const headers = parseCSVLine(rows[0]).map((h) => h.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').toLowerCase().trim());
        const getCol = (cols: string[], possibleNames: string[]) => {
          const index = headers.findIndex((h) => possibleNames.includes(h));
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
          if (payload.license_plate || payload.job_no) { insertData.push(payload); }
        }
        if (insertData.length > 0) {
          const { error } = await supabase.from('daily_plan').insert(insertData);
          if (error) throw error;
          alert(`✅ นำเข้าข้อมูลสำเร็จ ${insertData.length} รายการ!`);
          fetchDailyPlans();
        } else { alert('⚠️ ไม่พบข้อมูลที่ตรงกับฟอร์แมตในไฟล์'); }
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

  const fetchDailyPlans = async () => { const { data } = await supabase.from('daily_plan').select('*').order('id', { ascending: false }).limit(300); if (data) setDailyPlans(data); };
  
  const fetchMasterDocksList = async () => { const { data } = await supabase.from('master_docks').select('*').order('dock_no', { ascending: true }); if (data) setMasterDocksList(data); };
  
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
    if (data) { setDriverJobData(data); } else {
       alert('🏁 งานของคุณเสร็จสิ้นครบทุกคลังเรียบร้อยแล้ว!'); handleLogout();
    }
  };

  const fetchYardOrders = async () => {
    if (currentView !== 'yard') return; const { data, error } = await supabase.from('orders').select(`*, companies(*)`).eq('status', 'pending').order('created_at', { ascending: false }); if (data && !error) setYardOrders(data);
  };

  // 💡 [แก้ไข] ฟังก์ชันดึงงาน Shunt (รองรับภาษาไทย)
  const fetchShuntOrders = async () => {
    if (currentView !== 'shunt' || !shuntCompany) return;
    
    // ค้นหาบริษัทให้ฉลาดขึ้น (ดักจับทั้งไทยและอังกฤษ)
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
      // ถ้าหา ID บริษัทไม่เจอ ให้ดึงมาทั้งหมดแล้วกรอง
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
    if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); }
    if (currentView === 'receiver' || currentView === 'unloader') fetchWaitingJobs();
    if (currentView === 'driver') fetchDriverJob();
    if (currentView === 'yard') fetchYardOrders();
    if (currentView === 'shunt') fetchShuntOrders();
    
    const timer = setInterval(() => {
      if (currentView === 'admin') { fetchAllJobs(); fetchDailyPlans(); fetchMasterDocksList(); }
      if (currentView === 'receiver' || currentView === 'unloader') fetchWaitingJobs();
      if (currentView === 'driver') fetchDriverJob();
      if (currentView === 'yard') fetchYardOrders();
      if (currentView === 'shunt') fetchShuntOrders();
    }, 3000);
    return () => clearInterval(timer);
  }, [currentView, receiverDC, driverJobData, shuntCompany, filterDate]);

  const handleExportCSV = () => {
    if (allJobs.length === 0) { alert('ไม่มีข้อมูลให้ Export ครับ'); return; }
    
    const baseHeaders = ['วันที่ Check In', 'เลขคิวงาน', 'ทะเบียนรถ', 'ประเภทรถ', 'บริษัทขนส่ง', 'Vendor Code', 'Vendor Name', 'สถานะล่าสุด'];
    let dockHeaders = [];
    for (let i = 1; i <= 5; i++) {
      dockHeaders.push(`คลังที่ ${i}`, `ช่องจอด ${i}`, `Call Up ${i}`, `On Dock ${i}`, `Start Load ${i}`, `End Load ${i}`, `ถอยออก ${i}`);
    }
    const headers = [...baseHeaders, ...dockHeaders];

    const formatTime = (isoString: string | null) => isoString ? new Date(isoString).toLocaleTimeString('th-TH') : '-';
    const formatDate = (isoString: string | null) => isoString ? new Date(isoString).toLocaleDateString('th-TH') : '-';

    const groupedJobs: any = {};
    allJobs.forEach(job => {
      const planId = job.daily_plan_id;
      if (!groupedJobs[planId]) groupedJobs[planId] = [];
      groupedJobs[planId].push(job);
    });

    const csvData = Object.keys(groupedJobs).map(planId => {
      const jobs = groupedJobs[planId].sort((a: any, b: any) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime());
      const firstJob = jobs[0];
      const lastJob = jobs[jobs.length - 1];
      const plan = firstJob.daily_plan;

      let row = [
        `"${formatDate(firstJob.check_in_time)}"`, `"${displayQueue(firstJob.queue_number)}"`, `"${getDisplayPlate(plan)}"`,
        `"${plan?.transport_type || '-'}"`, `"${plan?.transport_company || '-'}"`, `"${plan?.vendor_code || '-'}"`,
        `"${plan?.vendor_name || '-'}"`, `"${lastJob.status}"`
      ];

      for (let i = 0; i < 5; i++) {
        if (jobs[i]) {
          const j = jobs[i];
          row.push(`"${getDCFromQueue(j.queue_number)}"`, `"${j.dock_number || '-'}"`, `"${formatTime(j.call_time)}"`, `"${formatTime(j.on_dock_time)}"`, `"${formatTime(j.start_load_time)}"`, `"${formatTime(j.end_load_time)}"`, `"${formatTime(j.finish_time)}"`);
        } else {
          row.push('""', '""', '""', '""', '""', '""', '""');
        }
      }
      return row.join(',');
    });

    const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvData].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', `Backhaul_Logistics_Report_${filterDate}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleExportDockCSV = () => {
    if (masterDocksList.length === 0) { alert('ไม่มีข้อมูลช่องจอดให้ Export ครับ'); return; }
    const headers = ['คลังสินค้า (DC)', 'ช่องจอด (Dock No)', 'ประเภท', 'จำนวนรถเข้าใช้งาน (คัน)', 'ใช้งานเฉลี่ย/คัน (นาที)', 'เวลาถูกใช้งาน/Unavailable (นาที)', 'เวลาว่าง/Available (นาที)', 'อัตราการใช้งาน (Utilization %)'];
    const csvData = masterDocksList.map(dock => {
      const usedJobs = allJobs.filter(j => j.dock_number && j.dock_number.includes(dock.dock_no) && j.on_dock_time);
      let totalUsedMins = 0;
      usedJobs.forEach(j => {
        const start = new Date(j.on_dock_time).getTime();
        const end = j.finish_time ? new Date(j.finish_time).getTime() : new Date().getTime();
        const diff = (end - start) / 60000;
        if (diff > 0) totalUsedMins += diff;
      });
      const avgPerTruck = usedJobs.length > 0 ? (totalUsedMins / usedJobs.length).toFixed(0) : 0;
      const totalMinsInDay = 24 * 60; 
      const availableMins = Math.max(0, totalMinsInDay - totalUsedMins);
      const utilizationPct = ((totalUsedMins / totalMinsInDay) * 100).toFixed(2);
      return `"${dock.physical_dc}","${dock.dock_no}","${dock.allowed_type}","${usedJobs.length}","${avgPerTruck}","${totalUsedMins.toFixed(0)}","${availableMins.toFixed(0)}","${utilizationPct}%"`;
    });
    const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvData].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', `Dock_Utilization_Report_${filterDate}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); const user = username.toLowerCase().trim(); const pass = password.trim();
    if (user === 'admin' && pass === '1234') { setCurrentView('admin'); setUsername(''); setPassword(''); }
    else if (user === 'admintpt' && pass === '1234') { setCurrentView('yard'); setUsername(''); setPassword(''); }
    else if (user === 'prt' && pass === '1234') { setCurrentView('shunt'); setShuntCompany('PRT'); setUsername(''); setPassword(''); }
    else if (user === 'vcg' && pass === '1234') { setCurrentView('shunt'); setShuntCompany('VCG'); setUsername(''); setPassword(''); }
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

  const handleLogout = () => { setCurrentView('login'); setReceiverDC(''); setDriverJobData(null); setShuntCompany(''); setCheckInModal(null); setPlanSearchQuery(''); };

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

  const handleCompleteShuntOrder = async (orderId: string, containerNo: string, destination: string, origin: string) => {
    try {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
      const { data: bJobsIn } = await supabase.from('backhaul_jobs').select('*, daily_plan(*)').eq('status', 'Assigned').like('dock_number', `%${destination}%`);
      if (bJobsIn && bJobsIn.length > 0) { const matchingJob = bJobsIn.find((job) => { const tp = job.daily_plan?.trailer_plate || job.daily_plan?.license_plate || ''; return tp === containerNo; }); if (matchingJob) await executeStatusUpdate(matchingJob.id, { status: 'On Dock', on_dock_time: new Date().toISOString() }); }
      if (destination === 'ตู้เปล่า') {
        const { data: bJobsOut } = await supabase.from('backhaul_jobs').select('*, daily_plan(*)').eq('status', 'End Load').like('dock_number', `%${origin}%`);
        if (bJobsOut && bJobsOut.length > 0) { const matchingJobOut = bJobsOut.find((job) => { const tp = job.daily_plan?.trailer_plate || job.daily_plan?.license_plate || ''; return tp === containerNo; }); if (matchingJobOut) await executeStatusUpdate(matchingJobOut.id, { status: 'Off Dock', finish_time: new Date().toISOString() }); }
      }
      fetchShuntOrders();
    } catch (error) { alert('❌ เกิดข้อผิดพลาด'); }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const { id, ...payloadWithoutId } = planForm; const isEdit = !!id;
      if (isEdit) { await supabase.from('daily_plan').update(planForm).eq('id', id); alert('✅ อัปเดตข้อมูลสำเร็จ'); } else { await supabase.from('daily_plan').insert([payloadWithoutId]); alert('✅ เพิ่มรายการรถสำเร็จ'); }
      setShowPlanForm(false); fetchDailyPlans();
    } catch (error) { alert('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล'); } finally { setLoading(false); }
  };

  const handleCancelPlan = async (id: string) => {
    const confirmCancel = window.confirm('คุณแน่ใจหรือไม่ที่จะ "ยกเลิก" และลบงานนี้ออกจากระบบ?');
    if (!confirmCancel) return; try { await supabase.from('daily_plan').delete().eq('id', id); fetchDailyPlans(); } catch (error) { alert('❌ ลบงานไม่สำเร็จ'); }
  };

  const handleCheckIn = async () => {
    if (!checkInModal || !checkInModal.selectedDC) { alert('❌ กรุณาเลือกคลังสินค้า (DC)'); return; }
    setLoading(true); const planData = checkInModal.plan; const selectedDC = checkInModal.selectedDC;
    try {
      const isT18W = planData.transport_type === 'T18W'; const isSpecialCompany = planData.transport_company?.includes('พรอรุณ') || planData.transport_company?.includes('คาร์โก้');
      let queueNo = ''; const today = new Date(); const dd = String(today.getDate()).padStart(2, '0'); const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dcNum = selectedDC === 'DC7.2' ? '7' : selectedDC.replace('DC', ''); const prefix = `${dcNum}-${dd}${mm}-`;
      if (!(isT18W && isSpecialCompany)) {
        const { count, error: countError } = await supabase.from('backhaul_jobs').select('*', { count: 'exact', head: true }).like('queue_number', `${prefix}%`);
        if (countError) throw countError; queueNo = `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
      } else { queueNo = `${dcNum}-VIP`; }

      const { data: existing } = await supabase.from('backhaul_jobs').select('id').eq('daily_plan_id', planData.id).neq('status', 'Finish').limit(1);
      if (existing && existing.length > 0) { alert('⚠️ รถคันนี้ Check-in ไปแล้ว'); setCheckInModal(null); setLoading(false); return; }

      await supabase.from('backhaul_jobs').insert([{ daily_plan_id: planData.id, queue_number: queueNo, status: 'Call Up', check_in_time: new Date().toISOString() }]);
      alert(`✅ เช็คอินสำเร็จ!`); setCheckInModal(null); setPlanSearchQuery(''); fetchAllJobs();
    } catch (error: any) { alert('❌ เกิดข้อผิดพลาดในการ Check In'); } finally { setLoading(false); }
  };

  const executeStatusUpdate = async (jobId: string, updateData: any) => {
    try { await supabase.from('backhaul_jobs').update(updateData).eq('id', jobId); if (currentView === 'admin') fetchAllJobs(); if (currentView === 'receiver' || currentView === 'unloader') fetchWaitingJobs(); if (currentView === 'driver') fetchDriverJob(); } catch (error) { alert('❌ เกิดข้อผิดพลาดในการอัปเดต'); }
  };

  const releaseDocks = async (jobId: string) => { try { await supabase.from('master_docks').update({ status: 'Available', current_job_id: null, current_plate: null, }).eq('current_job_id', jobId); } catch (error) {} };

  const handleUpdateStatus = async (job: any, currentStatus: string) => {
    const activeStatus = currentStatus === 'Waiting Unload' ? 'Call Up' : currentStatus;
    let nextStatus = ''; let updateData: any = {}; const transportType = job.daily_plan?.transport_type || '';
    if (activeStatus === 'Call Up') {
      const isTrailer = transportType === 'T6WT' || transportType === 'T10WT'; const requiredCount = isTrailer ? 2 : 1;
      const bhGroup = getDCFromQueue(job.queue_number);
      const { data } = await supabase.from('master_docks').select('*').eq('bh_group', bhGroup).in('allowed_type', ['Inbound', 'Both']).order('dock_no', { ascending: true });
      setDockModal({ isOpen: true, job, docks: data || [], selectedDocks: [], requiredCount, }); return;
    } else if (activeStatus === 'Assigned') { nextStatus = 'On Dock'; updateData = { status: nextStatus, on_dock_time: new Date().toISOString(), }; } 
    else if (activeStatus === 'On Dock') { nextStatus = 'Unloading'; updateData = { status: nextStatus, start_load_time: new Date().toISOString(), }; } 
    else if (activeStatus === 'Unloading') { setMultiDropConfig({ job: job, step: 'ask' }); return; } 
    else if (activeStatus === 'End Load') { nextStatus = 'Off Dock'; updateData = { status: nextStatus, finish_time: new Date().toISOString(), }; await releaseDocks(job.id); } 
    else if (activeStatus === 'Off Dock') { nextStatus = 'Finish'; updateData = { status: nextStatus }; }

    if (nextStatus) { await executeStatusUpdate(job.id, updateData); if (nextStatus === 'On Dock' || nextStatus === 'Off Dock') { try { await supabase.from('orders').update({ status: 'completed' }).eq('container_no', job.daily_plan?.trailer_plate || '-').eq('status', 'pending'); } catch (e) {} } }
  };

  const handleConfirmDock = async () => {
    if (!dockModal || dockModal.selectedDocks.length !== dockModal.requiredCount) return;
    const { job, selectedDocks } = dockModal; 
    const dockNo = selectedDocks.join(', ');
    
    const updateData = { status: 'Assigned', dock_number: dockNo, call_time: new Date().toISOString(), };
    await executeStatusUpdate(job.id, updateData);

    const plate = getDisplayPlate(job.daily_plan);
    await supabase.from('master_docks').update({ status: 'Occupied', current_job_id: job.id, current_plate: plate, }).in('dock_no', selectedDocks);
    
    // 💡 [แก้ไข] ดักชื่อบริษัทภาษาไทยตอน Assign Dock
    const companyName = job.daily_plan?.transport_company || ''; 
    let shuntCompanyId = null; 
    const transportType = job.daily_plan?.transport_type || '';

    if (companyName.includes('พรอรุณ') || companyName.includes('PRT')) { 
      const prt = companiesList.find((c) => JSON.stringify(c).toLowerCase().includes('prt') || JSON.stringify(c).includes('พรอรุณ')); 
      if (prt) shuntCompanyId = prt.id; 
    } else if (companyName.includes('คาร์โก้') || companyName.includes('VCG')) { 
      const vcg = companiesList.find((c) => JSON.stringify(c).toLowerCase().includes('vcg') || JSON.stringify(c).includes('คาร์โก้')); 
      if (vcg) shuntCompanyId = vcg.id; 
    }

    if (shuntCompanyId && transportType === 'T18W') { 
      await supabase.from('orders').insert([{ company_id: shuntCompanyId, container_no: job.daily_plan?.trailer_plate || '-', origin: job.dock_number || 'ลานจอด', destination: dockNo, status: 'pending', },]); 
    }
    setDockModal(null);
  };

  const handleMultiDropChoice = async (choice: 'yes' | 'no', nextDC?: string) => {
    if (!multiDropConfig) return; const job = multiDropConfig.job; const transportType = job.daily_plan?.transport_type || '';
    const now = new Date().toISOString();

    if (choice === 'no') {
      setMultiDropConfig(null); await executeStatusUpdate(job.id, { status: 'End Load', end_load_time: now, });
      
      // 💡 [แก้ไข] ดักชื่อบริษัทภาษาไทยตอนสร้างงานลากตู้เปล่า
      const companyName = job.daily_plan?.transport_company || ''; 
      let shuntCompanyId = null;
      if (companyName.includes('พรอรุณ') || companyName.includes('PRT')) { 
        const prt = companiesList.find((c) => JSON.stringify(c).toLowerCase().includes('prt') || JSON.stringify(c).includes('พรอรุณ')); 
        if (prt) shuntCompanyId = prt.id; 
      } else if (companyName.includes('คาร์โก้') || companyName.includes('VCG')) { 
        const vcg = companiesList.find((c) => JSON.stringify(c).toLowerCase().includes('vcg') || JSON.stringify(c).includes('คาร์โก้')); 
        if (vcg) shuntCompanyId = vcg.id; 
      }

      if (shuntCompanyId && transportType === 'T18W') { 
        await supabase.from('orders').insert([{ company_id: shuntCompanyId, container_no: job.daily_plan?.trailer_plate || '-', origin: job.dock_number || 'ลานจอด', destination: 'ตู้เปล่า', status: 'pending', },]); 
      }
    } else if (choice === 'yes' && nextDC) {
      setMultiDropConfig(null); let baseQueue = (job.queue_number || '').split(' (')[0]; let currentRoute = getDCRoute(job.queue_number);
      await executeStatusUpdate(job.id, { status: 'Finish', end_load_time: now, finish_time: now }); 
      await releaseDocks(job.id);

      await supabase.from('backhaul_jobs').insert([{ 
        daily_plan_id: job.daily_plan_id, 
        queue_number: `${baseQueue} (${currentRoute} -> ${nextDC})`, 
        status: 'Call Up',
        check_in_time: now
      }]);
      fetchAllJobs();
    }
  };

  const handleRollbackStatus = async (jobId: string, currentStatus: string) => {
    const confirmRollback = window.confirm(`ต้องการย้อนกลับสถานะ?`); if (!confirmRollback) return;
    let prevStatus = ''; let updateData: any = {};
    if (currentStatus === 'Assigned') { prevStatus = 'Call Up'; updateData = { status: prevStatus, call_time: null, dock_number: null }; await releaseDocks(jobId); }
    else if (currentStatus === 'On Dock') { prevStatus = 'Assigned'; updateData = { status: prevStatus, on_dock_time: null }; } 
    else if (currentStatus === 'Unloading') { prevStatus = 'On Dock'; updateData = { status: prevStatus, start_load_time: null }; } 
    else if (currentStatus === 'End Load') { prevStatus = 'Unloading'; updateData = { status: prevStatus, end_load_time: null }; } 
    else if (currentStatus === 'Off Dock') { prevStatus = 'End Load'; updateData = { status: prevStatus, finish_time: null }; } 
    else if (currentStatus === 'Finish') { prevStatus = 'Off Dock'; updateData = { status: prevStatus }; }
    if (prevStatus) await executeStatusUpdate(jobId, updateData);
  };

  const renderActionButton = (job: any) => {
    if (job.status === 'Finish') return (<span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✅ เสร็จสิ้น</span>);
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
  const getCompanyName = (companyObj: any, defaultId: string) => companyObj?.name || companyObj?.code || (defaultId ? defaultId.substring(0, 8) + '...' : '-');
  const isMultiDrop = driverJobData?.queue_number?.includes('(');
  const currentTargetDC = getDCFromQueue(driverJobData?.queue_number);
  const filteredPlans = dailyPlans.filter((p) => { if (!planSearchQuery) return true; const q = planSearchQuery.toLowerCase(); return ( p.license_plate?.toLowerCase().includes(q) || p.vendor_name?.toLowerCase().includes(q) || p.vendor_code?.toLowerCase().includes(q) || p.job_no?.toLowerCase().includes(q) || p.transport_summary_no?.toLowerCase().includes(q) ); });
  const isPlanCheckedIn = (planId: string) => { return allJobs.some( (job) => job.daily_plan_id === planId && job.status !== 'Finish' ); };

  const getExecDashboardKPIs = () => {
    const dailyPlansToday = dailyPlans.filter(p => true);
    const uniquePlansCheckIn = new Set(allJobs.map(j => j.daily_plan_id));
    const totalPlan = dailyPlansToday.length;
    const totalCheckIn = uniquePlansCheckIn.size;
    const notArrived = Math.max(0, totalPlan - totalCheckIn);
    
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

    const latestJobs = Object.values(allJobs.reduce((acc: any, job: any) => {
      acc[job.daily_plan_id] = job;
      return acc;
    }, {}));

    latestJobs.forEach((job: any) => {
      if (job.status === 'Call Up' || job.status === 'Assigned') countWait++;
      else if (job.status === 'On Dock') countOnDock++;
      else if (job.status === 'Unloading') countUnload++;
      else if (job.status === 'Finish' || job.status === 'End Load' || job.status === 'Off Dock') countFinished++;
    });

    const totalActiveStatuses = countWait + countOnDock + countUnload + countFinished;
    const toPercent = (count: number) => totalActiveStatuses > 0 ? ((count / totalActiveStatuses) * 100).toFixed(1) : '0.0';

    return {
      totalPlan, totalCheckIn, notArrived,
      countWait, pctWait: toPercent(countWait),
      countOnDock, pctOnDock: toPercent(countOnDock),
      countUnload, pctUnload: toPercent(countUnload),
      countFinished, pctFinished: toPercent(countFinished),
      avgWaitOverall: countWaitTime > 0 ? (sumWaitTime / countWaitTime).toFixed(0) : '0',
      avgLoadOverall: countLoadTime > 0 ? (sumLoadTime / countLoadTime).toFixed(0) : '0',
      dcStats
    };
  };

  const getDockUtilization = () => {
    const usageByDC: any = {};
    MASTER_DCS.forEach(dc => usageByDC[dc] = { totalIn: 0, occIn: 0 });

    masterDocksList.forEach(dock => {
      const dc = dock.physical_dc;
      if (!usageByDC[dc]) return;
      const isOccupied = dock.status === 'Occupied';
      if (dock.allowed_type === 'Inbound' || dock.allowed_type === 'Both') {
        usageByDC[dc].totalIn++;
        if (isOccupied) usageByDC[dc].occIn++;
      }
    });
    return usageByDC;
  };

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

  const displayJobs = Object.values(allJobs.reduce((acc: any, job: any) => {
    const pId = job.daily_plan_id;
    if (!acc[pId]) {
      acc[pId] = { ...job, combined_docks: job.dock_number ? [job.dock_number] : [] };
    } else {
      const newDocks = job.dock_number ? [...acc[pId].combined_docks, job.dock_number] : acc[pId].combined_docks;
      acc[pId] = { ...job, combined_docks: newDocks }; 
    }
    return acc;
  }, {}));

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
            <button onClick={() => setAdminTab('dashboard')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'dashboard' ? '#1976d2' : '#f1f5f9', color: adminTab === 'dashboard' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 🚛 รายการรถ Backhaul </button>
            <button onClick={() => setAdminTab('utilization')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'utilization' ? '#10b981' : '#f1f5f9', color: adminTab === 'utilization' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📊 Dock Utilization </button>
            <button onClick={() => setAdminTab('exec')} style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 'bold', background: adminTab === 'exec' ? '#f59e0b' : '#f1f5f9', color: adminTab === 'exec' ? 'white' : '#64748b', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', }}> 📈 Executive Dashboard </button>
          </div>

          {adminTab === 'exec' && (
            <div className="dashboard-card" style={{ background: '#f8fafc', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                 <h3 style={{ margin: 0, color: '#334155' }}>📊 Executive Dashboard (ข้อมูลวันที่ {new Date(filterDate).toLocaleDateString('th-TH')})</h3>
                 <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #1976d2' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>แผนงานวันนี้ (Plan)</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.totalPlan} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #10b981' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>กลับ Check-In แล้ว</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.totalCheckIn} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '5px solid #ef4444' }}>
                  <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>ยังไม่กลับเข้ามา</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#1e293b' }}>{execData.notArrived} <span style={{ fontSize:'14px', color:'#64748b'}}>คัน</span></div>
                </div>
              </div>

              <h4 style={{ color: '#334155', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>📍 สถานะรถในลานปัจจุบัน (คิดจากยอดที่ Check-In)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>รอลงสินค้า (Wait)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{execData.countWait} คัน</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{execData.pctWait}%</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>On Dock (ยังไม่ลง)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{execData.countOnDock} คัน</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{execData.pctOnDock}%</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>กำลังลงสินค้า</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8b5cf6' }}>{execData.countUnload} คัน</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{execData.pctUnload}%</div>
                </div>
                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontWeight: 'bold' }}>ลงจบ / Check-Out</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{execData.countFinished} คัน</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{execData.pctFinished}%</div>
                </div>
              </div>

              <h4 style={{ color: '#334155', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>⏱️ ประสิทธิภาพเวลา (เฉลี่ย)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                <div style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                   <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '10px' }}>ภาพรวมทั้งหมด</div>
                   <div>รอลงสินค้าเฉลี่ย: <strong style={{color:'#f59e0b'}}>{execData.avgWaitOverall} นาที/รอบ</strong></div>
                   <div>เวลาลงสินค้าเฉลี่ย: <strong style={{color:'#10b981'}}>{execData.avgLoadOverall} นาที/รอบ</strong></div>
                </div>
                {MASTER_DCS.map(dc => {
                  const stats = execData.dcStats[dc];
                  const wait = stats.waitCount > 0 ? (stats.waitSum / stats.waitCount).toFixed(0) : '0';
                  const load = stats.loadCount > 0 ? (stats.loadSum / stats.loadCount).toFixed(0) : '0';
                  return (
                    <div key={dc} style={{ background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '10px' }}>แยกตามคลัง {dc}</div>
                      <div>รอลงสินค้าเฉลี่ย: <strong style={{color:'#f59e0b'}}>{wait} นาที/รอบ</strong></div>
                      <div>เวลาลงสินค้าเฉลี่ย: <strong style={{color:'#10b981'}}>{load} นาที/รอบ</strong></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {adminTab === 'plan' && (
            <div className="dashboard-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '10px', }}>
                <input type="text" placeholder="🔍 ค้นหา Doc.No,BH Job,VD.Code,VD.Name,ทะเบียนรถ" value={planSearchQuery} onChange={(e) => setPlanSearchQuery(e.target.value)} style={{ padding: '10px', width: '100%', maxWidth: '450px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '16px', }} autoFocus />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-action call-up" style={{ padding: '10px 20px', fontSize: '16px', background: '#475569', color: 'white', border: 'none', }} disabled={loading} > {loading ? '⏳ กำลังนำเข้า...' : '📥 นำเข้าไฟล์ CSV'} </button>
                  <button onClick={() => { setPlanForm(initialPlanForm); setShowPlanForm(true); }} className="btn-action on-dock" style={{ padding: '10px 20px', fontSize: '16px' }} > ➕ เพิ่มรายการรถ </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead> <tr> <th>Transport No</th> <th>Job No</th> <th>Vendor</th> <th>ทะเบียนรถ</th> <th>ประเภท</th> <th>สถานะ</th> <th style={{ textAlign: 'center' }}>Action</th> </tr> </thead>
                  <tbody>
                    {filteredPlans.length === 0 ? ( <tr> <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }} > ไม่พบข้อมูลแผนงาน </td> </tr> ) : (
                      filteredPlans.map((plan) => (
                        <tr key={plan.id}>
                          <td style={{ color: '#1976d2', fontWeight: 'bold' }}> {plan.transport_summary_no || '-'} </td>
                          <td>{plan.job_no || '-'}</td>
                          <td className="vendor-cell"> {plan.vendor_code && ( <span style={{ color: '#64748b', fontSize: '13px', display: 'block', fontWeight: 'normal', }} > [{plan.vendor_code}] </span> )} {plan.vendor_name || '-'} </td>
                          <td style={{ fontWeight: 'bold' }}> {getDisplayPlate(plan)} </td>
                          <td>{plan.transport_type || '-'}</td>
                          <td> {isPlanCheckedIn(plan.id) ? ( <span style={{ color: '#2e7d32', fontWeight: 'bold', background: '#e8f5e9', padding: '4px 8px', borderRadius: '4px', }} > ✅ Checked In </span> ) : ( <span style={{ color: '#ed6c02', fontWeight: 'bold' }} > ⏳ Pending </span> )} </td>
                          <td style={{ textAlign: 'center', width: '250px' }}>
                            {isPlanCheckedIn(plan.id) ? ( <span style={{ color: '#666' }}> อยู่ในลานแล้ว </span> ) : (
                              <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', }} >
                                <button onClick={() => setCheckInModal({ isOpen: true, plan, selectedDC: '', }) } className="btn-action assigned" style={{ padding: '6px 10px', fontSize: '13px', }} > 🟢 Check-In </button>
                                <button onClick={() => { setPlanForm(plan); setShowPlanForm(true); }} className="btn-action call-up" style={{ padding: '6px 10px', fontSize: '13px', background: '#f59e0b', color: 'white', }} > ✏️ Edit </button>
                                <button onClick={() => handleCancelPlan(plan.id)} className="btn-rollback" style={{ padding: '6px 10px', fontSize: '13px', }} > ❌ Cancel </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'dashboard' && (
            <div className="dashboard-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px', }}>
                <h3 style={{ margin: 0 }}>📊 รายการรถ Backhaul</h3>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#334155' }}> 📈 Dock Utilization (Real-time Performance) </h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', }} />
                  <button onClick={handleExportDockCSV} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', }} > 📊 โหลดรายงาน Dock (CSV) </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginBottom: '30px', }}>
                {MASTER_DCS.map(dc => {
                  const data = utilData[dc];
                  const pctIn = data.totalIn > 0 ? ((data.occIn / data.totalIn) * 100).toFixed(0) : '0';
                  return (
                    <div key={dc} style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '5px solid #10b981' }}>
                       <h4 style={{ margin: '0 0 10px 0', color: '#334155'}}>คลัง {dc}</h4>
                       <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px'}}>
                          <span style={{color: '#64748b'}}>Inbound Usage:</span>
                          <strong style={{color: '#ef4444'}}>{data.occIn}/{data.totalIn} บาน ({pctIn}%)</strong>
                       </div>
                       <div style={{ fontSize: '12px', color: '#94a3b8' }}></div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px', }}>
                <h3 style={{ margin: 0, color: '#334155' }}> 🏢 Live Dock Heatmap (เฉพาะฝั่ง Inbound) </h3>
                <div style={{ display: 'flex', gap: '15px', fontSize: '14px', fontWeight: 'bold', color: '#475569', }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', }}> <div style={{ width: '16px', height: '16px', background: '#22c55e', borderRadius: '4px', }} ></div> ว่างพร้อมใช้งาน </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', }} > <div style={{ width: '16px', height: '16px', background: '#ef4444', borderRadius: '4px', }} ></div> กำลังลงสินค้า </span>
                </div>
              </div>

              <div style={{ background: 'transparent' }}>
                {masterDocksList.length === 0 ? ( <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', }} > กำลังโหลดแผนผังประตู... </div> ) : ( renderHeatmap() )}
              </div>
            </div>
          )}
        </div>
      )}

      {showPlanForm && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto', }} >
            <h3 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }} > {planForm.id ? '✏️ แก้ไขรายการรถ' : '➕ เพิ่มรายการรถ'} </h3>
            <form onSubmit={handleSavePlan}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginTop: '15px', }} >
                <div className="form-group"> <label>Transport Summary No *</label> <input required value={planForm.transport_summary_no} onChange={(e) => setPlanForm({ ...planForm, transport_summary_no: e.target.value, }) } /> </div>
                <div className="form-group"> <label>Job No *</label> <input required value={planForm.job_no} onChange={(e) => setPlanForm({ ...planForm, job_no: e.target.value }) } /> </div>
                <div className="form-group"> <label>Vendor Code</label> <input value={planForm.vendor_code} onChange={(e) => setPlanForm({ ...planForm, vendor_code: e.target.value }) } /> </div>
                <div className="form-group"> <label>Vendor Name *</label> <input required value={planForm.vendor_name} onChange={(e) => setPlanForm({ ...planForm, vendor_name: e.target.value }) } /> </div>
                <div className="form-group"> <label>Transport Type *</label> <input required placeholder="เช่น T10W, T18W" value={planForm.transport_type} onChange={(e) => setPlanForm({ ...planForm, transport_type: e.target.value, }) } /> </div>
                <div className="form-group"> <label>ทะเบียนรถ (License Plate) *</label> <input required value={planForm.license_plate} onChange={(e) => setPlanForm({ ...planForm, license_plate: e.target.value, }) } /> </div>
                <div className="form-group"> <label>ทะเบียนหาง (Trailer Plate)</label> <input placeholder="ถ้ามี..." value={planForm.trailer_plate} onChange={(e) => setPlanForm({ ...planForm, trailer_plate: e.target.value, }) } /> </div>
                <div className="form-group"> <label>ชื่อคนขับ (Driver Name)</label> <input value={planForm.driver_name} onChange={(e) => setPlanForm({ ...planForm, driver_name: e.target.value }) } /> </div>
                <div className="form-group"> <label>บริษัทขนส่ง (Transport Company) *</label> <input required value={planForm.transport_company} onChange={(e) => setPlanForm({ ...planForm, transport_company: e.target.value, }) } /> </div>
                <div className="form-group"> <label>Appointment No</label> <input placeholder="ถ้ามี..." value={planForm.appointment_no} onChange={(e) => setPlanForm({ ...planForm, appointment_no: e.target.value, }) } /> </div>
              </div>
              <div className="modal-buttons" style={{ marginTop: '25px' }}>
                <button type="submit" className="btn-action on-dock" style={{ padding: '12px 20px', fontSize: '16px' }} disabled={loading} > {loading ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูล'} </button>
                <button type="button" className="btn-rollback" style={{ padding: '12px 20px', fontSize: '16px' }} onClick={() => setShowPlanForm(false)} > ❌ ปิด </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {checkInModal && checkInModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>📍 เลือกคลังสินค้า (DC) สำหรับลงสินค้า</h3>
            <p> ทะเบียนรถ:{' '} <strong style={{ color: '#d32f2f' }}> {getDisplayPlate(checkInModal.plan)} </strong> </p>
            <p> Vendor:{' '} <strong style={{ color: '#1976d2' }}> {checkInModal.plan.vendor_code ? `[${checkInModal.plan.vendor_code}] ` : ''} {checkInModal.plan.vendor_name} </strong> </p>
            <div className="dc-grid" style={{ marginTop: '15px' }}>
              {MASTER_DCS.map((dc) => (
                <label key={dc} className={`dc-radio-card ${ checkInModal.selectedDC === dc ? 'active' : '' }`} >
                  <input type="radio" value={dc} checked={checkInModal.selectedDC === dc} onChange={(e) => setCheckInModal({ ...checkInModal, selectedDC: e.target.value, }) } style={{ display: 'none' }} /> {dc}
                </label>
              ))}
            </div>
            <div className="modal-buttons" style={{ marginTop: '20px' }}>
              <button className="btn-action on-dock" onClick={handleCheckIn} disabled={loading} style={{ padding: '12px 20px', fontSize: '16px' }} > {loading ? 'กำลังบันทึก...' : '✅ ยืนยัน Check-In'} </button>
              <button className="btn-rollback" onClick={() => setCheckInModal(null)} style={{ padding: '12px 20px', fontSize: '16px' }} > ❌ ยกเลิก </button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'yard' && (
        <>
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
        </>
      )}

      {currentView === 'shunt' && (
        <div className="card">
          <h2 style={{ textAlign: 'center', marginBottom: '10px', color: '#1976d2', }} > 🚛 งานลากตู้ - ทีม {shuntCompany} </h2>
          {shuntOrders.length === 0 ? ( <div className="empty-state">🎉 ไม่มีงานลากตู้ค้าง</div> ) : (
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