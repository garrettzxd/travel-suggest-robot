export interface Attraction {
  name: string;
  address?: string;
  category: string;
  rating?: number;
}

export interface WeatherDaily {
  date: string;
  tMinC: number;
  tMaxC: number;
  condition: string;
  precipMm: number;
}

export interface WeatherSnapshot {
  location: string;
  lat: number;
  lon: number;
  current: {
    tempC: number;
    condition: string;
    windKph: number;
  };
  daily: WeatherDaily[];
}

export interface TravelVerdict {
  goodTimeToVisit: boolean;
  reason: string;
}
