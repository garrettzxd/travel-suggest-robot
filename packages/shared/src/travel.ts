/**
 * 单条景点的结构化数据，来自高德搜索 POI 2.0。
 * 向下兼容：老字段 name/address/category/rating 保持原样；
 * 新增字段均为可选，前端不读到也不会报错。
 */
export interface Attraction {
  /** 景点名称 */
  name: string;
  /** 详细地址，高德缺失时置 undefined */
  address?: string;
  /** 一级分类文本，如 "风景名胜"、"寺庙"、"城市广场" 等 */
  category: string;
  /** 大众点评 0–5 星评分；high德 business.rating 缺失时置 undefined */
  rating?: number;
  /** LLM 在 finalizeTripCard 阶段补齐的一句话点评；裸数据阶段为空 */
  description?: string;
  /** 相对城市中心的直线距离（km）；用 QWeather 拿到的城市中心 + POI 坐标做 haversine */
  distanceKm?: number;
  /** 首张 POI 图片 URL，来自高德 photos[0].url */
  imageUrl?: string;
  /** 完整分类链条，按高德 type 字段 ";" split 得到 */
  tags?: string[];
}

/** 未来 7 日中的单日天气条目 */
export interface WeatherDaily {
  /** 日期 YYYY-MM-DD，来自 QWeather fxDate */
  date: string;
  /** 最低气温（℃） */
  tMinC: number;
  /** 最高气温（℃） */
  tMaxC: number;
  /** 白天主导天气文本，如"多云"/"中雨" */
  condition: string;
  /** 当日降水量（mm） */
  precipMm: number;
  /** QWeather iconDay 编码，如 "100"、"305"；前端据此挑 qweather-icons 字体码 */
  iconCode?: string;
}

/** 某城市当前 + 未来 7 日的天气快照，由 getWeather 工具产出 */
export interface WeatherSnapshot {
  /** 城市显示名，来自 QWeather geo.location.name */
  location: string;
  /** 城市中心纬度 */
  lat: number;
  /** 城市中心经度 */
  lon: number;
  /** 实时天气块 */
  current: {
    /** 当前温度（℃） */
    tempC: number;
    /** 当前主导天气文本 */
    condition: string;
    /** 风速（km/h） */
    windKph: number;
    /** 相对湿度百分比（0–100） */
    humidityPct: number;
    /** 风向中文，如"东南" */
    windDir: string;
    /** 风力等级，如"2 级"或"2" */
    windScale: string;
    /** 能见度（km） */
    visibilityKm: number;
    /** QWeather now.icon 编码 */
    iconCode: string;
  };
  /** 未来 7 日预报列表 */
  daily: WeatherDaily[];
}

/** 汇总后的出行结论，由 LLM 综合天气 + 时节给出 */
export interface TravelVerdict {
  /** 是否推荐近期出发 */
  goodTimeToVisit: boolean;
  /** 结论理由，面向用户 */
  reason: string;
}

/**
 * 一张完整的「行程卡」。由 chat 路由把 getWeather / getAttractions 的裸数据
 * 与 finalizeTripCard 工具输出的 narrative 字段合并而成，前端据此一次性渲染
 * 地点 Hero / 天气 / 景点 / 出行建议四张子卡。
 */
export interface TripCard {
  /** 顶部地点 Hero 区域 */
  hero: {
    /** 省/大区代码，如 YN */
    regionCode: string;
    /** 行政区链条，如 "云南省 · 傣族自治州" */
    regionPath: string;
    /** 城市显示名 */
    city: string;
    /** 一句城市介绍 */
    tagline: string;
    /** 出行评估枚举：good / caution / avoid */
    verdictBadge: string;
    /**
     * 顶图 URL。由 chat 路由从 attractions 第一张可用 photo 派生，
     * 缺失时前端走斜纹占位（PLACEHOLDER）。
     */
    heroImageUrl?: string;
  };
  /**
   * 天气卡数据：裸 WeatherSnapshot 再加一段整体评估 summary。
   * getWeather 工具失败时整段省略——前端据此展示"天气暂不可用"空态，
   * 不影响 hero / attractions / recommendation 的渲染。
   */
  weather?: WeatherSnapshot & { summary: string };
  /** 景点列表，description 已由 finalizeTripCard 填充 */
  attractions: Attraction[];
  /** 出行建议面板文案 */
  recommendation: {
    /** 顶部 pill 文案，如 "推荐 · 近期出发" */
    tag: string;
    /** 建议标题 */
    headline: string;
    /** 建议正文 */
    body: string;
  };
  /** 四条后续追问建议 chip，恰好 4 条 */
  chips: string[];
}

/**
 * 一日行程内的单个活动条目。
 * 对应行程规划卡时间轴上的一个节点。
 */
export interface ItineraryItem {
  /** 时段或具体时间，如 "上午"、"傍晚"、"8:00"、"或"；可空 */
  time?: string;
  /** 主活动标题，如 "断桥残雪 → 白堤 → 平湖秋月" */
  title: string;
  /** 右侧标签 pill，如 "步行"、"船游"、"人文"；可空 */
  tag?: string;
  /** 一句话补充说明：路线、时长、提示 */
  desc: string;
}

/**
 * 一日行程：左侧 rail 显示 DAY N + subtitle，右侧时间轴串联多条 item。
 */
export interface ItineraryDay {
  /** 当天主题副标题，如 "西湖核心区"、"灵隐 + 西溪 / 龙井"；可空 */
  subtitle?: string;
  /** 时间轴条目，建议 2–5 条 */
  items: ItineraryItem[];
}

/**
 * 一张完整的「行程规划卡」。
 * 与 TripCard 平级，由 recommendItinerary 工具产出并通过 SSE `itinerary` 事件下发。
 */
export interface Itinerary {
  /** 卡片标题，如 "5/1 三天两晚 · 杭州行程" */
  title: string;
  /** 逐日时间轴，长度等于总天数，建议 1–5 天 */
  days: ItineraryDay[];
  /** 底部"提示"虚线区文案；可空 */
  footnote?: string;
}
