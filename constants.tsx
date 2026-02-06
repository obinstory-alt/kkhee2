
import { PlatformConfig, PlatformType } from './types';

export const INITIAL_PLATFORMS: Record<PlatformType, PlatformConfig> = {
  BAEMIN: { id: 'BAEMIN', name: '배달의민족', feeRate: 0.068, color: '#2AC1BC' },
  COUPANG: { id: 'COUPANG', name: '쿠팡이츠', feeRate: 0.098, color: '#00AEEF' },
  YOGIYO: { id: 'YOGIYO', name: '요기요', feeRate: 0.125, color: '#FA0050' },
  NAVER: { id: 'NAVER', name: '네이버', feeRate: 0.035, color: '#03C75A' },
  STORE: { id: 'STORE', name: '매장(카드)', feeRate: 0.015, color: '#FFFFFF' },
};

export const INITIAL_MENUS = ['닭강정', '국밥', '냉면'];

export const STORAGE_KEYS = {
  REPORTS: 'kh_ledger_v26_reports',
  CONFIG_MENUS: 'kh_config_menus',
  CONFIG_PLATFORMS: 'kh_config_platforms',
  DRAFT: 'kh_ledger_draft',
  // v9~v15를 포함한 과거 모든 가능한 키값 목록 확장
  LEGACY: [
    'kh_ledger_v25_master', 
    'kh_sales_v24_final', 
    'kh_sales_v24', 
    'sales_data', 
    'kh_ledger', 
    'kh_ledger_v17', 
    'kh_ledger_v15', 
    'kh_ledger_v14', 
    'kh_ledger_v13', 
    'kh_ledger_v12', 
    'kh_ledger_v11', 
    'kh_ledger_v10', 
    'kh_ledger_v9',
    'kh_sales_v15',
    'kh_sales_v14',
    'kh_sales_v13',
    'kh_sales_v12',
    'kh_sales_v11',
    'kh_sales_v10',
    'kh_sales_v9',
    'kh_sales', 
    'ledger_data',
    'sales_records',
    'kyunghee_sales'
  ]
};
