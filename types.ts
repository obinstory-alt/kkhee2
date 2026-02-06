
export type PlatformType = 'BAEMIN' | 'COUPANG' | 'YOGIYO' | 'NAVER' | 'STORE';

export interface MenuSale {
  menuName: string;
  count: number;
  amount: number;
}

export interface PlatformDailyEntry {
  platform: PlatformType;
  menuSales: MenuSale[];
  platformTotalAmount: number;
  platformTotalCount: number;
  feeAmount: number;
  settlementAmount: number;
}

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  entries: PlatformDailyEntry[];
  totalAmount: number;
  totalCount: number;
  memo: string;
  createdAt: number;
}

export interface PlatformConfig {
  id: PlatformType;
  name: string;
  feeRate: number;
  color: string;
}

export type ViewType = 'HOME' | 'INPUT' | 'STATS' | 'SETTINGS';
export type StatsPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
