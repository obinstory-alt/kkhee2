import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Home as HomeIcon, 
  PlusCircle, 
  BarChart3, 
  Settings as SettingsIcon, 
  Download, 
  Upload, 
  Trash2, 
  Calendar,
  Wallet,
  ArrowUpRight,
  ChevronRight,
  FileSpreadsheet,
  Save, 
  CheckCircle2,
  Plus,
  X,
  List,
  AreaChart as ChartIcon,
  RefreshCw,
  Search,
  Database,
  Calculator,
  ShieldCheck,
  FileJson,
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  ShoppingBag,
  Tag
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { DailyReport, PlatformDailyEntry, MenuSale, ViewType, PlatformType, StatsPeriod, PlatformConfig } from './types';
import { INITIAL_PLATFORMS, INITIAL_MENUS, STORAGE_KEYS } from './constants';

declare const XLSX: any;

// ID 생성기 폴백
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>('HOME');
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [customMenus, setCustomMenus] = useState<string[]>(INITIAL_MENUS);
  const [platformConfigs, setPlatformConfigs] = useState<Record<PlatformType, PlatformConfig>>(INITIAL_PLATFORMS);
  
  const [draftEntries, setDraftEntries] = useState<PlatformDailyEntry[]>([]);
  const [draftMemo, setDraftMemo] = useState('');
  const [draftDate, setDraftDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  // --- 초강력 데이터 복구 파서 (구조 결함 방어) ---
  const resilientParse = useCallback((rawData: any, sourceName: string): DailyReport[] => {
    const results: DailyReport[] = [];
    if (!rawData) return results;
    const items = Array.isArray(rawData) ? rawData : [rawData];

    items.forEach((item: any) => {
      try {
        if (!item || typeof item !== 'object') return;
        
        // 날짜 파싱 및 유효성 검사
        const rawDate = item.date || item.dt || item.d || item.s_date || item.sale_date || item.created_at || item.timestamp || item.day;
        if (!rawDate) return;

        let formattedDate: string;
        try {
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) return; // 유효하지 않은 날짜 제외
          formattedDate = d.toISOString().split('T')[0];
        } catch { return; }

        // 금액 및 건수 보정
        const rawAmount = Number(item.totalAmount ?? item.amount ?? item.amt ?? item.sum ?? 0);
        const rawCount = Number(item.totalCount ?? item.count ?? item.cnt ?? 0);
        const finalAmount = isFinite(rawAmount) ? rawAmount : 0;
        const finalCount = isFinite(rawCount) ? rawCount : 0;

        // 플랫폼 매핑
        let rawPlatform = (item.platform || item.plat || item.type || 'STORE').toString().toUpperCase();
        if (rawPlatform.includes('BAEMIN') || rawPlatform.includes('배달')) rawPlatform = 'BAEMIN';
        else if (rawPlatform.includes('COUPANG') || rawPlatform.includes('쿠팡')) rawPlatform = 'COUPANG';
        else if (rawPlatform.includes('YOGIYO') || rawPlatform.includes('요기')) rawPlatform = 'YOGIYO';
        else if (rawPlatform.includes('NAVER') || rawPlatform.includes('네이버')) rawPlatform = 'NAVER';
        else rawPlatform = 'STORE';

        // 메뉴 데이터 보정 (배열 보장 - 먹통의 핵심 원인 해결)
        const rawMenuSales = item.menuSales || item.menus || (item.entries ? item.entries[0]?.menuSales : []) || [];
        const safeMenuSales: MenuSale[] = Array.isArray(rawMenuSales) ? rawMenuSales.map((m: any) => ({
          menuName: String(m.menuName || m.name || '알 수 없는 메뉴'),
          count: Number(m.count || m.qty || 0),
          amount: Number(m.amount || m.price || 0)
        })) : [];

        // v26 표준 구조로 변환하여 삽입
        results.push({
          id: item.id || generateId(),
          date: formattedDate,
          entries: item.entries && Array.isArray(item.entries) ? item.entries.map((e: any) => ({
            ...e,
            menuSales: Array.isArray(e.menuSales) ? e.menuSales : [],
            platformTotalAmount: Number(e.platformTotalAmount || 0),
            platformTotalCount: Number(e.platformTotalCount || 0)
          })) : [{
            platform: rawPlatform as PlatformType,
            menuSales: safeMenuSales,
            platformTotalAmount: finalAmount,
            platformTotalCount: finalCount,
            feeAmount: Number(item.feeAmount || 0),
            settlementAmount: Number(item.settlementAmount || finalAmount)
          }],
          totalAmount: finalAmount || (item.entries ? item.entries.reduce((s: number, e: any) => s + Number(e.platformTotalAmount || 0), 0) : 0),
          totalCount: finalCount || (item.entries ? item.entries.reduce((s: number, e: any) => s + Number(e.platformTotalCount || 0), 0) : 0),
          memo: String(item.memo || item.note || `복원됨 (${sourceName})`),
          createdAt: Number(item.createdAt || Date.now())
        });
      } catch (e) { console.error("데이터 파싱 오류 건너뜀:", e); }
    });
    return results;
  }, []);

  const scanAndConsolidate = useCallback((manual = false) => {
    setIsScanning(true);
    let consolidated: DailyReport[] = [];
    
    const currentData = localStorage.getItem(STORAGE_KEYS.REPORTS);
    if (currentData) {
      try { consolidated = JSON.parse(currentData); } catch(e) { console.error(e); }
    }

    Object.keys(localStorage).forEach(key => {
        if (key === STORAGE_KEYS.REPORTS) return;
        const data = localStorage.getItem(key);
        if (!data) return;
        try {
            const parsed = JSON.parse(data);
            if (parsed) {
                const restored = resilientParse(parsed, key);
                consolidated = [...consolidated, ...restored];
            }
        } catch (e) {}
    });

    const uniqueReports = Array.from(new Map(consolidated.map(r => [r.id, r])).values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setReports(uniqueReports);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(uniqueReports));
    setIsScanning(false);
    if (manual) alert(`복구 완료: 총 ${uniqueReports.length}건의 데이터를 확인했습니다.`);
  }, [resilientParse]);

  useEffect(() => {
    const initApp = async () => {
      try {
        const savedMenus = localStorage.getItem(STORAGE_KEYS.CONFIG_MENUS);
        const savedConfigs = localStorage.getItem(STORAGE_KEYS.CONFIG_PLATFORMS);
        const savedDraft = localStorage.getItem(STORAGE_KEYS.DRAFT);

        if (savedMenus) setCustomMenus(JSON.parse(savedMenus));
        if (savedConfigs) setPlatformConfigs(JSON.parse(savedConfigs));
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          setDraftEntries(parsed.entries || []);
          setDraftMemo(parsed.memo || '');
          setDraftDate(parsed.date || new Date().toISOString().split('T')[0]);
        }
        scanAndConsolidate();
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    initApp();
  }, [scanAndConsolidate]);

  const saveReports = (newReports: DailyReport[]) => {
    setReports(newReports);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(newReports));
  };

  // --- Home Metrics (안전한 계산) ---
  const homeMetrics = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    
    const curMonthSales = reports.filter(r => {
      const d = new Date(r.date);
      return !isNaN(d.getTime()) && d.getMonth() === curMonth && d.getFullYear() === curYear;
    }).reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;
    const prevMonthSales = reports.filter(r => {
      const d = new Date(r.date);
      return !isNaN(d.getTime()) && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }).reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

    return { curMonthSales, prevMonthSales };
  }, [reports]);

  // --- 통계 엔진 (안전성 강화) ---
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('DAILY');
  const [statsViewType, setStatsViewType] = useState<'LIST' | 'CHART'>('LIST');

  const getPeriodKey = (dateStr: string, period: StatsPeriod) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "날짜 미상";
    if (period === 'DAILY') return dateStr;
    if (period === 'WEEKLY') {
      const start = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
      const week = Math.ceil((days + start.getDay() + 1) / 7);
      return `${d.getFullYear()}년 ${week}주차`;
    }
    if (period === 'MONTHLY') return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (period === 'YEARLY') return `${d.getFullYear()}년`;
    return dateStr;
  };

  const groupedStats = useMemo(() => {
    const groups = new Map<string, { amount: number, count: number }>();
    reports.forEach(r => {
      const key = getPeriodKey(r.date, statsPeriod);
      const cur = groups.get(key) || { amount: 0, count: 0 };
      groups.set(key, { 
        amount: cur.amount + (Number(r.totalAmount) || 0), 
        count: cur.count + (Number(r.totalCount) || 0) 
      });
    });
    return Array.from(groups.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [reports, statsPeriod]);

  const detailedAggregates = useMemo(() => {
    const platformMap = new Map<PlatformType, { amount: number, count: number }>();
    const menuMap = new Map<string, { amount: number, count: number }>();
    
    reports.forEach(r => {
      if (!r.entries || !Array.isArray(r.entries)) return;
      r.entries.forEach(e => {
        const plat = e.platform || 'STORE';
        const p = platformMap.get(plat) || { amount: 0, count: 0 };
        platformMap.set(plat, { 
          amount: p.amount + (Number(e.platformTotalAmount) || 0), 
          count: p.count + (Number(e.platformTotalCount) || 0) 
        });
        
        if (e.menuSales && Array.isArray(e.menuSales)) {
          e.menuSales.forEach(ms => {
            const m = menuMap.get(ms.menuName) || { amount: 0, count: 0 };
            menuMap.set(ms.menuName, { 
              amount: m.amount + (Number(ms.amount) || 0), 
              count: m.count + (Number(ms.count) || 0) 
            });
          });
        }
      });
    });

    return {
      platforms: Array.from(platformMap.entries()).sort((a, b) => b[1].amount - a[1].amount),
      menus: Array.from(menuMap.entries()).sort((a, b) => b[1].amount - a[1].amount)
    };
  }, [reports]);

  const finalizeDailySettlement = () => {
    if (draftEntries.length === 0) return alert("데이터가 없습니다.");
    const totalAmount = draftEntries.reduce((sum, e) => sum + e.platformTotalAmount, 0);
    const totalCount = draftEntries.reduce((sum, e) => sum + e.platformTotalCount, 0);
    
    const newReport: DailyReport = {
      id: generateId(),
      date: draftDate,
      entries: [...draftEntries],
      totalAmount,
      totalCount,
      memo: draftMemo,
      createdAt: Date.now()
    };
    saveReports([newReport, ...reports]);
    setDraftEntries([]);
    setDraftMemo('');
    setView('HOME');
    alert("오늘 장부가 마감되었습니다.");
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const imported = resilientParse(data.reports || data, file.name);
        const combined = Array.from(new Map([...reports, ...imported].map(r => [r.id, r])).values())
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        saveReports(combined);
        alert(`데이터 복원 성공: 총 ${imported.length}건이 추가되었습니다.`);
        setView('HOME');
      } catch (e) { alert('파일 복원 중 오류가 발생했습니다.'); }
    };
    reader.readAsText(file);
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <div className="text-white/40 font-bold text-xs tracking-widest">장부 데이터 동기화 중...</div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white selection:bg-blue-500/30">
      {/* Sidebar */}
      <nav className="hidden md:flex flex-col w-72 glass border-r border-white/10 p-6 space-y-6">
        <div className="text-2xl font-bold tracking-tighter px-2 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Wallet className="w-5 h-5" /></div>
          경희장부 <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded ml-2">v26.0</span>
        </div>
        <div className="flex-1 space-y-1">
          <NavBtn icon={HomeIcon} label="홈" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <NavBtn icon={PlusCircle} label="기록하기" active={view === 'INPUT'} onClick={() => setView('INPUT')} />
          <NavBtn icon={BarChart3} label="통계 분석" active={view === 'STATS'} onClick={() => setView('STATS')} />
          <NavBtn icon={SettingsIcon} label="설정" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-6 scroll-smooth">
        <div className="max-w-4xl mx-auto px-6 pt-10">
          
          {view === 'HOME' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-top-2 duration-500">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold">오늘, {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</h1>
                  <p className="text-white/40 mt-1">실시간 정산 및 통합 분석 리포트</p>
                </div>
              </header>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="전월 누적 매출" value={homeMetrics.prevMonthSales.toLocaleString()} icon={ArrowUpRight} color="text-white/40" />
                <MetricCard label="당월 누적 매출" value={homeMetrics.curMonthSales.toLocaleString()} icon={Wallet} color="text-blue-500" highlight />
              </div>
              <section className="space-y-4">
                <h2 className="text-xl font-bold px-1">최근 매출 현황</h2>
                <div className="glass apple-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/5">
                        <th className="py-4 px-4 text-left font-medium text-white/40">날짜</th>
                        <th className="py-4 px-4 text-right font-medium text-white/40">매출액</th>
                        <th className="py-4 px-4 text-right font-medium text-white/40">건수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {reports.slice(0, 5).map(r => (
                        <tr key={r.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4 text-white/80">{r.date}</td>
                          <td className="py-4 px-4 text-right font-bold">{(Number(r.totalAmount) || 0).toLocaleString()}원</td>
                          <td className="py-4 px-4 text-right text-white/40">{(Number(r.totalCount) || 0).toLocaleString()}건</td>
                        </tr>
                      ))}
                      {reports.length === 0 && (
                        <tr><td colSpan={3} className="p-12 text-center text-white/20 italic">입력된 데이터가 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {view === 'INPUT' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <h1 className="text-3xl font-bold">일정산 마감</h1>
              <div className="glass apple-card p-6 space-y-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-white/40 ml-1">정산 날짜</label>
                  <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)} className="w-full text-lg font-medium" />
                </div>
                <PlatformInputSection 
                  menus={customMenus} 
                  configs={platformConfigs} 
                  onAddEntry={(entry) => setDraftEntries([...draftEntries.filter(e => e.platform !== entry.platform), entry])} 
                  existingEntries={draftEntries} 
                />
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 ml-1">특이사항 메모</label>
                  <textarea value={draftMemo} onChange={e => setDraftMemo(e.target.value)} placeholder="날씨, 특이사항 등..." className="w-full glass rounded-2xl p-4 text-sm h-24 resize-none focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={finalizeDailySettlement} disabled={draftEntries.length === 0} className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-lg hover:bg-blue-500 disabled:opacity-20 transition-all active:scale-[0.98]">오늘 정산 마감</button>
              </div>
            </div>
          )}

          {view === 'STATS' && (
            <div className="space-y-8 animate-in fade-in duration-500 pb-12">
              <header className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">통계 분석</h1>
                <div className="flex bg-white/5 p-1 rounded-xl">
                  <button onClick={() => setStatsViewType('LIST')} className={`p-2 rounded-lg transition-all ${statsViewType === 'LIST' ? 'bg-white/10 text-white' : 'text-white/30'}`}><List className="w-4 h-4" /></button>
                  <button onClick={() => setStatsViewType('CHART')} className={`p-2 rounded-lg transition-all ${statsViewType === 'CHART' ? 'bg-white/10 text-white' : 'text-white/30'}`}><ChartIcon className="w-4 h-4" /></button>
                </div>
              </header>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as StatsPeriod[]).map(p => (
                  <button key={p} onClick={() => setStatsPeriod(p)} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all ${statsPeriod === p ? 'bg-blue-600 text-white' : 'glass text-white/40'}`}>
                    {p === 'DAILY' ? '일별' : p === 'WEEKLY' ? '주별' : p === 'MONTHLY' ? '월별' : '연별'}
                  </button>
                ))}
              </div>

              {statsViewType === 'LIST' ? (
                <div className="space-y-10">
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> 기간별 매출 요약</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr><th className="p-4 text-left text-white/40">분류 기간</th><th className="p-4 text-right text-white/40">총 매출액</th><th className="p-4 text-right text-white/40">주문수</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {groupedStats.map(s => (
                            <tr key={s.period} className="hover:bg-white/5"><td className="p-4 font-medium">{s.period}</td><td className="p-4 text-right font-bold text-blue-400">{s.amount.toLocaleString()}원</td><td className="p-4 text-right text-white/60">{s.count.toLocaleString()}건</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-emerald-500" /> 플랫폼별 분석</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr><th className="p-4 text-left text-white/40">플랫폼</th><th className="p-4 text-right text-white/40">매출</th><th className="p-4 text-right text-white/40">주문</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailedAggregates.platforms.map(([id, data]) => (
                            <tr key={id}><td className="p-4 flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full" style={{background: platformConfigs[id]?.color || '#fff'}} /><span className="font-semibold">{platformConfigs[id]?.name || id}</span></td><td className="p-4 text-right font-bold">{data.amount.toLocaleString()}원</td><td className="p-4 text-right text-white/40">{data.count.toLocaleString()}건</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><Tag className="w-4 h-4 text-amber-500" /> 메뉴별 분석 (전체)</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr><th className="p-4 text-left text-white/40">메뉴명</th><th className="p-4 text-right text-white/40">총 매출</th><th className="p-4 text-right text-white/40">판매량</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailedAggregates.menus.map(([name, data]) => (
                            <tr key={name}><td className="p-4 font-medium">{name}</td><td className="p-4 text-right font-bold text-white">{data.amount.toLocaleString()}원</td><td className="p-4 text-right text-white/40">{data.count.toLocaleString()}건</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="glass apple-card p-6 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={groupedStats.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="period" hide />
                      <YAxis hide />
                      <Tooltip contentStyle={{background: '#111', border: 'none', borderRadius: '16px'}} formatter={(v: any) => [`${v.toLocaleString()}원`, '매출']} />
                      <Area type="monotone" dataKey="amount" stroke="#3b82f6" fillOpacity={0.15} fill="#3b82f6" strokeWidth={4} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {view === 'SETTINGS' && (
            <div className="space-y-10 animate-in fade-in duration-500 pb-20">
              <h1 className="text-3xl font-bold">설정</h1>
              <section className="space-y-4">
                <h2 className="text-lg font-bold px-1 flex items-center gap-2"><Database className="w-5 h-5 text-blue-500" /> 데이터 관리</h2>
                <div className="glass apple-card p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1"><p className="font-bold text-sm">통합 데이터 스캔</p><p className="text-[11px] text-white/40">파편화된 모든 기록을 찾아 v26으로 통합합니다.</p></div>
                    <button onClick={() => scanAndConsolidate(true)} className="bg-blue-600 px-5 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"><ShieldCheck className="w-4 h-4" /></button>
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <label className="w-full glass py-4 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer hover:bg-white/10 text-sm">
                      <FileJson className="w-5 h-5 text-emerald-500" /> 백업 파일(.json) 복원
                      <input type="file" className="hidden" accept=".json" onChange={importData} />
                    </label>
                  </div>
                </div>
              </section>
              <button onClick={() => { if(confirm('모든 데이터를 삭제하시겠습니까?')) { saveReports([]); alert('초기화됨'); } }} className="w-full glass py-4 rounded-2xl text-rose-500 font-bold">전체 초기화</button>
            </div>
          )}
        </div>
      </main>

      {/* Tab Bar Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/10 h-20 px-6 flex items-center justify-around z-50">
        <TabBtn icon={HomeIcon} label="홈" active={view === 'HOME'} onClick={() => setView('HOME')} />
        <TabBtn icon={PlusCircle} label="기록" active={view === 'INPUT'} onClick={() => setView('INPUT')} />
        <TabBtn icon={BarChart3} label="통계" active={view === 'STATS'} onClick={() => setView('STATS')} />
        <TabBtn icon={SettingsIcon} label="설정" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
      </nav>
    </div>
  );
};

// --- Helpers ---
const MetricCard: React.FC<{ label: string, value: string, icon: any, color: string, highlight?: boolean }> = ({ label, value, icon: Icon, color, highlight }) => (
  <div className={`glass apple-card p-5 space-y-3 ${highlight ? 'ring-2 ring-blue-500/40 bg-blue-500/10' : ''}`}>
    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">{label}</span><Icon className={`w-4 h-4 ${color}`} /></div>
    <div className="flex items-baseline gap-1"><span className="text-2xl font-bold">{value}</span><span className="text-xs text-white/20">원</span></div>
  </div>
);
const NavBtn: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${active ? 'bg-white/10 text-white' : 'text-white/30 hover:bg-white/5'}`}>
    <Icon className={`w-5 h-5 ${active ? 'text-blue-500' : ''}`} /><span className="font-semibold text-sm">{label}</span>
  </button>
);
const TabBtn: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 ${active ? 'text-blue-500' : 'text-white/30'}`}><Icon className="w-6 h-6" /><span className="text-[10px] font-bold">{label}</span></button>
);

const PlatformInputSection: React.FC<{ menus: string[], configs: Record<PlatformType, PlatformConfig>, onAddEntry: (e: PlatformDailyEntry) => void, existingEntries: PlatformDailyEntry[] }> = ({ menus, configs, onAddEntry, existingEntries }) => {
  const [sel, setSel] = useState<PlatformType>('BAEMIN');
  const [data, setData] = useState<Record<string, { count: string, amount: string }>>({});
  const active = existingEntries.find(e => e.platform === sel);
  useEffect(() => {
    if (active) {
      const d: any = {};
      active.menuSales.forEach(s => d[s.menuName] = { count: s.count.toString(), amount: s.amount.toString() });
      setData(d);
    } else setData({});
  }, [sel, active]);
  const handleSave = () => {
    const sales: MenuSale[] = (Object.entries(data) as [string, { count: string, amount: string }][]).map(([name, val]) => ({ menuName: name, count: Number(val.count) || 0, amount: Number(val.amount) || 0 })).filter(s => s.count > 0 || s.amount > 0);
    const amount = sales.reduce((s, x) => s + x.amount, 0);
    const count = sales.reduce((s, x) => s + x.count, 0);
    const fee = Math.floor(amount * (configs[sel]?.feeRate || 0));
    onAddEntry({ platform: sel, menuSales: sales, platformTotalAmount: amount, platformTotalCount: count, feeAmount: fee, settlementAmount: amount - fee });
    alert(`${configs[sel]?.name || sel} 저장됨`);
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(Object.keys(configs) as PlatformType[]).map(pt => (
          <button key={pt} onClick={() => setSel(pt)} className={`px-4 py-2 rounded-xl text-xs font-bold border ${sel === pt ? 'bg-white/10 border-blue-500/50' : 'glass border-white/5 text-white/30'}`}>{configs[pt]?.name || pt}</button>
        ))}
      </div>
      <div className="space-y-4 glass p-5 rounded-3xl bg-white/5">
        <div className="space-y-2">
          {menus.map(m => (
            <div key={m} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 text-xs font-medium text-white/80">{m}</div>
              <input type="number" placeholder="건수" className="col-span-3 text-center text-xs py-2.5 bg-white/5 border-white/10 rounded-xl" value={data[m]?.count || ''} onChange={e => setData({...data, [m]: {...(data[m] || {amount:''}), count: e.target.value}})} />
              <input type="number" placeholder="금액" className="col-span-5 text-right text-xs py-2.5 bg-white/5 border-white/10 rounded-xl pr-4" value={data[m]?.amount || ''} onChange={e => setData({...data, [m]: {...(data[m] || {count:''}), amount: e.target.value}})} />
            </div>
          ))}
        </div>
        <button onClick={handleSave} className="w-full py-3.5 bg-white/10 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"><Save className="w-3.5 h-3.5 text-blue-500" /> 플랫폼 데이터 임시 저장</button>
      </div>
    </div>
  );
};

export default App;
