export interface MenuItem {
  id: number;
  category: string;
  subTab: string | null;
  name: string;
  nameEn: string;
  image: string;
  description: string;
  origin: string;
}

export interface SauceTab {
  name: string;
  image: string;
}

export interface MenuResponse {
  ct: string;
  tab: string | null;
  sauceTabs?: SauceTab[];
  items: MenuItem[];
}

export interface DetailData {
  name: string;
  nameEn: string;
  image: string;
  description: string;
  origin: string;
  spicyImage?: string | null;
}

export interface RecommFoodItem extends DetailData {
  detailImage: string;
}

export interface Store {
  id: number;
  name: string;
  shortName: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  hours: string[];
  mapEmbed: string;
}

export interface Post {
  idx: number;
  type: 'notice' | 'event';
  title: string;
  date: string;
  thumbnail: string | null;
  content?: string;
  /** 이벤트 기간 (이벤트 게시글만) */
  startDate?: string | null;
  endDate?: string | null;
  /** 백엔드가 계산한 이벤트 진행 상태 */
  status?: 'ongoing' | 'ended' | 'upcoming';
  prev?: { idx: number; title: string } | null;
  next?: { idx: number; title: string } | null;
}

export interface HomeData {
  banners: { image: string }[];
  newMenu: (DetailData & { detailImage: string })[];
  recommendMenu: (DetailData & {
    detailImage: string;
    category: string;
    title: string;
    subtitle: string;
  })[];
  recommFood: RecommFoodItem[];
  events: Post[];
  notices: Post[];
}
