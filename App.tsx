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
  Tag,
  ArrowRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, PieChart, Pie
} from 'recharts';
import { DailyReport, PlatformDailyEntry, MenuSale, ViewType, PlatformType, StatsPeriod, PlatformConfig } from './types';
import { INITIAL_PLATFORMS, INITIAL_MENUS, STORAGE_KEYS } from './constants';

declare const XLSX: any;

// ID 생성기 폴백 (crypto.randomUUID가 없는 환경 대응)
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

  // --- Hyper-Resilient Parser ---
  const resilientParse = useCallback((rawData: any, sourceName: string): DailyReport[] => {
    const results: DailyReport[] = [];
    if (!rawData) return results;
    const items = Array.isArray(rawData) ? rawData : [rawData];

    items.forEach((item: any) => {
      try {
        if (!item || typeof item !== 'object') return;
        
        // 표준 포맷 확인
        if (item.entries && Array.isArray(item.entries) && item.date) {
          results.push(item);
          return;
        }

        // 레거시 포맷 매핑
        const rawDate = item.date || item.dt || item.d || item.s_date || item.sale_date || item.created_at || item.timestamp || item.day;
        if (!rawDate) return;

        let formattedDate: string;
        try {
          if (typeof rawDate === 'string') {
            const match = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
            formattedDate = match ? match[0] : new Date(rawDate).toISOString().split('T')[0];
          } else {
            formattedDate = new Date(rawDate).toISOString().split('T')[0];
          }
        } catch { return; }

        const rawAmount = item.totalAmount ?? item.amount ?? item.amt ?? item.sum ?? item.price ?? item.total_price ?? item.val ?? item.sales ?? 0;
        const rawCount = item.totalCount ?? item.count ?? item.cnt ?? item.qty ?? item.quantity ?? item.orders ?? 1;
        
        let rawPlatform = (item.platform || item.plat || item.type || item.platform_name || item.p_type || 'STORE').toString().toUpperCase();
        if (rawPlatform.includes('BAEMIN') || rawPlatform.includes('배달')) rawPlatform = 'BAEMIN';
        else if (rawPlatform.includes('COUPANG') || rawPlatform.includes('쿠팡')) rawPlatform = 'COUPANG';
        else if (rawPlatform.includes('YOGIYO') || rawPlatform.includes('요기')) rawPlatform = 'YOGIYO';
        else if (rawPlatform.includes('NAVER') || rawPlatform.includes('네이버')) rawPlatform = 'NAVER';
        else rawPlatform = 'STORE';

        results.push({
          id: item.id || generateId(),
          date: formattedDate,
          entries: [{
            platform: rawPlatform as PlatformType,
            menuSales: item.menuSales || item.menus || [],
            platformTotalAmount: Number(rawAmount),
            platformTotalCount: Number(rawCount),
            feeAmount: Number(item.feeAmount || 0),
            settlementAmount: Number(item.settlementAmount || rawAmount)
          }],
          totalAmount: Number(rawAmount),
          totalCount: Number(rawCount),
          memo: item.memo || item.note || `Restored from ${sourceName}`,
          createdAt: item.createdAt || Date.now()
        });
      } catch (e) { console.warn("Parse error:", e); }
    });
    return results;
  }, []);

  const scanAndConsolidate = useCallback((manual = false) => {
    setIsScanning(true);
    let consolidated: DailyReport[] = [];
    
    // 1. 현재 데이터 로드
    const currentData = localStorage.getItem(STORAGE_KEYS.REPORTS);
    if (currentData) {
      try { consolidated = JSON.parse(currentData); } catch(e) { console.error(e); }
    }

    // 2. 전체 스토리지 스캔
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
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

    // 3. 중복 제거 및 정렬
    const uniqueReports = Array.from(new Map(consolidated.map(r => [r.id, r])).values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setReports(uniqueReports);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(uniqueReports));
    setIsScanning(false);
    if (manual) alert(`스캔 완료: 총 ${uniqueReports.length}건의 데이터를 통합했습니다.`);
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
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, [scanAndConsolidate]);

  const saveReports = (newReports: DailyReport[]) => {
    setReports(newReports);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(newReports));
  };

  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify({ entries: draftEntries, memo: draftMemo, date: draftDate }));
    }
  }, [draftEntries, draftMemo, draftDate, loading]);

  // --- Home Metrics ---
  const homeMetrics = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const curMonthSales = reports.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === curMonth && d.getFullYear() === curYear;
    }).reduce((sum, r) => sum + r.totalAmount, 0);

    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;
    const prevMonthSales = reports.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }).reduce((sum, r) => sum + r.totalAmount, 0);
    return { curMonthSales, prevMonthSales };
  }, [reports]);

  // --- Statistics Logic (요구사항 반영) ---
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('DAILY');
  const [statsViewType, setStatsViewType] = useState<'LIST' | 'CHART'>('LIST');

  const getPeriodKey = (dateStr: string, period: StatsPeriod) => {
    const d = new Date(dateStr);
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
      groups.set(key, { amount: cur.amount + r.totalAmount, count: cur.count + r.totalCount });
    });
    return Array.from(groups.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [reports, statsPeriod]);

  // 메뉴별, 플랫폼별 상세 합계 계산
  const detailedAggregates = useMemo(() => {
    const platformMap = new Map<PlatformType, { amount: number, count: number }>();
    const menuMap = new Map<string, { amount: number, count: number }>();
    
    reports.forEach(r => {
      r.entries.forEach(e => {
        const p = platformMap.get(e.platform) || { amount: 0, count: 0 };
        platformMap.set(e.platform, { amount: p.amount + e.platformTotalAmount, count: p.count + e.platformTotalCount });
        
        e.menuSales.forEach(ms => {
          const m = menuMap.get(ms.menuName) || { amount: 0, count: 0 };
          menuMap.set(ms.menuName, { amount: m.amount + ms.amount, count: m.count + ms.count });
        });
      });
    });

    return {
      platforms: Array.from(platformMap.entries()).sort((a, b) => b[1].amount - a[1].amount),
      menus: Array.from(menuMap.entries()).sort((a, b) => b[1].amount - a[1].amount)
    };
  }, [reports]);

  const draftMenuSummary = useMemo(() => {
    const summary: Record<string, { count: number, amount: number }> = {};
    draftEntries.forEach(entry => {
      entry.menuSales.forEach(sale => {
        if (!summary[sale.menuName]) summary[sale.menuName] = { count: 0, amount: 0 };
        summary[sale.menuName].count += sale.count;
        summary[sale.menuName].amount += sale.amount;
      });
    });
    return Object.entries(summary).sort((a, b) => b[1].amount - a[1].amount);
  }, [draftEntries]);

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
    alert("정산이 마감되었습니다.");
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
        alert(`복원 완료: ${imported.length}건`);
      } catch (e) { alert('파일 형식이 올바르지 않습니다.'); }
    };
    reader.readAsText(file);
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-black gap-4">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <div className="text-white/40 font-bold tracking-widest text-sm">시스템 초기화 중...</div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white selection:bg-blue-500/30">
      {/* Sidebar (Desktop) */}
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-6 scroll-smooth">
        <div className="max-w-4xl mx-auto px-6 pt-10">
          
          {/* VIEW: HOME */}
          {view === 'HOME' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-top-2 duration-500">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold">오늘, {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</h1>
                  <p className="text-white/40 mt-1">프리미엄 정산 시스템 v26.0</p>
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
                          <td className="py-4 px-4 text-right font-bold">{r.totalAmount.toLocaleString()}원</td>
                          <td className="py-4 px-4 text-right text-white/40">{r.totalCount}건</td>
                        </tr>
                      ))}
                      {reports.length === 0 && (
                        <tr><td colSpan={3} className="p-12 text-center text-white/20 italic">입력된 매출 데이터가 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* VIEW: INPUT */}
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
                {draftEntries.length > 0 && (
                  <div className="space-y-3 glass apple-card p-4 border-blue-500/20 bg-blue-500/5">
                    <label className="text-xs font-bold text-blue-400 flex items-center gap-2"><Calculator className="w-4 h-4" /> 실시간 메뉴별 판매 합계</label>
                    <div className="divide-y divide-white/5">
                      {draftMenuSummary.map(([name, data]) => (
                        <div key={name} className="py-2 flex justify-between text-xs">
                          <span className="text-white/60">{name}</span>
                          <span className="font-bold">{data.count}건 / {data.amount.toLocaleString()}원</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 ml-1">특이사항 메모</label>
                  <textarea value={draftMemo} onChange={e => setDraftMemo(e.target.value)} placeholder="오늘의 특이사항을 기록하세요..." className="w-full glass rounded-2xl p-4 text-sm h-24 resize-none focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={finalizeDailySettlement} disabled={draftEntries.length === 0} className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-lg hover:bg-blue-500 disabled:opacity-20 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">오늘 정산 마감하기</button>
              </div>
            </div>
          )}

          {/* VIEW: STATS (고도화된 통계 분석) */}
          {view === 'STATS' && (
            <div className="space-y-8 animate-in fade-in duration-500 pb-12">
              <header className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">통계 분석</h1>
                <div className="flex bg-white/5 p-1 rounded-xl">
                  <button onClick={() => setStatsViewType('LIST')} className={`p-2 rounded-lg transition-all ${statsViewType === 'LIST' ? 'bg-white/10 text-white' : 'text-white/30'}`}><List className="w-4 h-4" /></button>
                  <button onClick={() => setStatsViewType('CHART')} className={`p-2 rounded-lg transition-all ${statsViewType === 'CHART' ? 'bg-white/10 text-white' : 'text-white/30'}`}><ChartIcon className="w-4 h-4" /></button>
                </div>
              </header>

              {/* 기준 선택 (일/주/월/연) */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as StatsPeriod[]).map(p => (
                  <button 
                    key={p} 
                    onClick={() => setStatsPeriod(p)} 
                    className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${statsPeriod === p ? 'bg-blue-600 text-white' : 'glass text-white/40 hover:text-white'}`}
                  >
                    {p === 'DAILY' ? '일별' : p === 'WEEKLY' ? '주별' : p === 'MONTHLY' ? '월별' : '연별'}
                  </button>
                ))}
              </div>

              {statsViewType === 'LIST' ? (
                <div className="space-y-10">
                  {/* 매출현황과 주문건수 */}
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> 기간별 매출 및 주문 요약</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr>
                            <th className="p-4 text-left text-white/40">분류 기간</th>
                            <th className="p-4 text-right text-white/40">총 매출액</th>
                            <th className="p-4 text-right text-white/40">주문수</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {groupedStats.map(s => (
                            <tr key={s.period} className="hover:bg-white/5 transition-colors">
                              <td className="p-4 font-medium">{s.period}</td>
                              <td className="p-4 text-right font-bold text-blue-400">{s.amount.toLocaleString()}원</td>
                              <td className="p-4 text-right text-white/60">{s.count.toLocaleString()}건</td>
                            </tr>
                          ))}
                          {groupedStats.length === 0 && (
                            <tr><td colSpan={3} className="p-10 text-center text-white/20 italic">분석할 데이터가 없습니다.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* 플랫폼별 통계 */}
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-emerald-500" /> 플랫폼별 실적 분석</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr>
                            <th className="p-4 text-left text-white/40">플랫폼</th>
                            <th className="p-4 text-right text-white/40">매출 합계</th>
                            <th className="p-4 text-right text-white/40">주문 합계</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailedAggregates.platforms.map(([id, data]) => (
                            <tr key={id} className="hover:bg-white/5 transition-colors">
                              <td className="p-4 flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full" style={{background: platformConfigs[id]?.color || '#fff'}} />
                                <span className="font-semibold">{platformConfigs[id]?.name || id}</span>
                              </td>
                              <td className="p-4 text-right font-bold">{data.amount.toLocaleString()}원</td>
                              <td className="p-4 text-right text-white/40">{data.count.toLocaleString()}건</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* 메뉴별 통계 (플랫폼 합계) */}
                  <section className="space-y-4">
                    <h2 className="text-sm font-bold text-white/40 px-1 flex items-center gap-2"><Tag className="w-4 h-4 text-amber-500" /> 메뉴별 판매 성과 (전체 플랫폼 합계)</h2>
                    <div className="glass apple-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-white/5 border-b border-white/5">
                          <tr>
                            <th className="p-4 text-left text-white/40">메뉴명</th>
                            <th className="p-4 text-right text-white/40">총 매출액</th>
                            <th className="p-4 text-right text-white/40">총 판매량</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailedAggregates.menus.map(([name, data]) => (
                            <tr key={name} className="hover:bg-white/5 transition-colors">
                              <td className="p-4 font-medium">{name}</td>
                              <td className="p-4 text-right font-bold text-white">{data.amount.toLocaleString()}원</td>
                              <td className="p-4 text-right text-white/40">{data.count.toLocaleString()}건</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="glass apple-card p-6 h-80">
                      <h3 className="text-xs font-bold mb-6 text-white/40 uppercase tracking-widest">매출 변동 추이</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={groupedStats.slice().reverse()}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="period" hide />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{background: '#111', border: 'none', borderRadius: '16px', fontSize: '12px'}} 
                            formatter={(value: any) => [`${value.toLocaleString()}원`, '매출액']}
                          />
                          <Area type="monotone" dataKey="amount" stroke="#3b82f6" fillOpacity={0.15} fill="#3b82f6" strokeWidth={4} />
                        </AreaChart>
                      </ResponsiveContainer>
                   </div>
                   <div className="glass apple-card p-6 h-80">
                      <h3 className="text-xs font-bold mb-6 text-white/40 uppercase tracking-widest">주문 건수 변동 추이</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={groupedStats.slice().reverse()}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="period" hide />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{background: '#111', border: 'none', borderRadius: '16px', fontSize: '12px'}} 
                            formatter={(value: any) => [`${value.toLocaleString()}건`, '주문수']}
                          />
                          <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {view === 'SETTINGS' && (
            <div className="space-y-10 animate-in fade-in duration-500 pb-20">
              <h1 className="text-3xl font-bold">설정</h1>
              <section className="space-y-4">
                <h2 className="text-lg font-bold px-1 flex items-center gap-2"><Database className="w-5 h-5 text-blue-500" /> 데이터 보호 및 스캔</h2>
                <div className="glass apple-card p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                       <p className="font-bold text-sm">하이퍼 데이터 스캔 엔진</p>
                       <p className="text-[11px] text-white/40 mt-1">로컬 스토리지의 모든 파편화된 과거 장부 데이터를 검색하여 v26으로 통합합니다.</p>
                    </div>
                    <button onClick={() => scanAndConsolidate(true)} className="bg-blue-600 px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-500 active:scale-95 transition-all">
                      <ShieldCheck className="w-4 h-4" /> 정밀 스캔
                    </button>
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <label className="w-full glass py-4 rounded-xl flex items-center justify-center gap-2 font-bold cursor-pointer hover:bg-white/10 transition-all border-dashed border-white/20 text-sm">
                      <FileJson className="w-5 h-5 text-emerald-500" /> 외부 JSON 백업 파일 복원
                      <input type="file" className="hidden" accept=".json" onChange={importData} />
                    </label>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-bold px-1">수수료 정책 설정</h2>
                <div className="glass apple-card divide-y divide-white/5 overflow-hidden">
                  {(Object.values(platformConfigs) as PlatformConfig[]).map(p => (
                    <div key={p.id} className="p-5 flex justify-between items-center hover:bg-white/5 transition-colors">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" 
                          step="0.1" 
                          value={p.feeRate * 100} 
                          onChange={e => {
                            const newRate = Number(e.target.value) / 100;
                            const next = {...platformConfigs, [p.id]: {...p, feeRate: newRate}};
                            setPlatformConfigs(next);
                            localStorage.setItem(STORAGE_KEYS.CONFIG_PLATFORMS, JSON.stringify(next));
                          }} 
                          className="w-20 text-right font-bold text-blue-400 bg-transparent" 
                        /> 
                        <span className="text-xs text-white/40 font-bold">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <button onClick={() => { if(confirm('모든 장부 데이터를 영구 삭제하시겠습니까?')) { saveReports([]); alert('초기화되었습니다.'); } }} className="w-full glass py-4 rounded-2xl text-rose-500 font-bold hover:bg-rose-500/10 transition-all">전체 데이터 초기화</button>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/10 h-20 px-6 flex items-center justify-around z-50">
        <TabBtn icon={HomeIcon} label="홈" active={view === 'HOME'} onClick={() => setView('HOME')} />
        <TabBtn icon={PlusCircle} label="기록" active={view === 'INPUT'} onClick={() => setView('INPUT')} />
        <TabBtn icon={BarChart3} label="통계" active={view === 'STATS'} onClick={() => setView('STATS')} />
        <TabBtn icon={SettingsIcon} label="설정" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
      </nav>
    </div>
  );
};

// --- Helper Components ---

const MetricCard: React.FC<{ label: string, value: string, icon: any, color: string, highlight?: boolean }> = ({ label, value, icon: Icon, color, highlight }) => (
  <div className={`glass apple-card p-5 space-y-3 transition-all ${highlight ? 'ring-2 ring-blue-500/40 bg-blue-500/10' : ''}`}>
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      <span className="text-xs text-white/20 font-bold">원</span>
    </div>
  </div>
);

const NavBtn: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${active ? 'bg-white/10 text-white shadow-inner shadow-white/5' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
    <Icon className={`w-5 h-5 ${active ? 'text-blue-500' : ''}`} />
    <span className="font-semibold text-sm">{label}</span>
  </button>
);

const TabBtn: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-blue-500' : 'text-white/30'}`}>
    <Icon className={`w-6 h-6 ${active ? 'scale-110' : ''}`} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const PlatformInputSection: React.FC<{ 
  menus: string[], 
  configs: Record<PlatformType, PlatformConfig>, 
  onAddEntry: (e: PlatformDailyEntry) => void, 
  existingEntries: PlatformDailyEntry[] 
}> = ({ menus, configs, onAddEntry, existingEntries }) => {
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
    const sales: MenuSale[] = (Object.entries(data) as [string, { count: string, amount: string }][]).map(([name, val]) => ({ 
      menuName: name, 
      count: Number(val.count) || 0, 
      amount: Number(val.amount) || 0 
    })).filter(s => s.count > 0 || s.amount > 0);

    const amount = sales.reduce((s, x) => s + x.amount, 0);
    const count = sales.reduce((s, x) => s + x.count, 0);
    const fee = Math.floor(amount * (configs[sel]?.feeRate || 0));
    
    onAddEntry({ 
      platform: sel, 
      menuSales: sales, 
      platformTotalAmount: amount, 
      platformTotalCount: count, 
      feeAmount: fee, 
      settlementAmount: amount - fee 
    });
    alert(`${configs[sel]?.name || sel} 데이터가 저장되었습니다.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(Object.keys(configs) as PlatformType[]).map(pt => (
          <button 
            key={pt} 
            onClick={() => setSel(pt)} 
            className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${sel === pt ? 'bg-white/10 border-blue-500/50 text-white ring-1 ring-blue-500/20' : 'glass border-white/5 text-white/30 hover:text-white'}`}
          >
            {configs[pt]?.name || pt} {existingEntries.some(e => e.platform === pt) && '✓'}
          </button>
        ))}
      </div>
      <div className="space-y-4 glass p-5 rounded-3xl border-white/5 bg-white/5">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-blue-400">{configs[sel]?.name || sel} 메뉴별 입력</p>
        </div>
        <div className="space-y-2">
          {menus.map(m => (
            <div key={m} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 text-xs font-medium text-white/80">{m}</div>
              <input 
                type="number" 
                placeholder="건수" 
                className="col-span-3 text-center text-xs py-2.5 bg-white/5 border-white/10 rounded-xl" 
                value={data[m]?.count || ''} 
                onChange={e => setData({...data, [m]: {...(data[m] || {amount:''}), count: e.target.value}})} 
              />
              <div className="col-span-5 relative">
                <input 
                  type="number" 
                  placeholder="금액" 
                  className="w-full text-right pr-6 text-xs py-2.5 bg-white/5 border-white/10 rounded-xl" 
                  value={data[m]?.amount || ''} 
                  onChange={e => setData({...data, [m]: {...(data[m] || {count:''}), amount: e.target.value}})} 
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/20 font-bold">원</span>
              </div>
            </div>
          ))}
        </div>
        <button 
          onClick={handleSave} 
          className="w-full mt-2 py-3.5 bg-white/10 rounded-2xl text-xs font-bold hover:bg-white/20 transition-all border border-white/10 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Save className="w-3.5 h-3.5 text-blue-500" /> {configs[sel]?.name || sel} 플랫폼 저장
        </button>
      </div>
    </div>
  );
};

export default App;
