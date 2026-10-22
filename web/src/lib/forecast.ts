export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm'

export interface SampleDay {
  date: string
  weather: Weather
  p90: number
  p50: number
  p10: number
  actual: number
  rain_mm: number
}

export interface Score {
  days: number
  p90_hit_rate: number
  p50_mape_pct: number
  p10_exceed_rate: number
}

export interface Backtest {
  approach: 'forecast_features' | 'historical_patterns'
  approach_label: string
  caveat: string
  actual_source: string
  model: string
  train_period: string
  test_period: string
  calibration: { method: string; p90_shift_mwh: number; raw_p90_hit_rate_2022: number }
  portfolio_kwp: number
  demand_mwh_day: number
  test: Score
  test_uncalibrated: Score
  baseline_climatology_mape_pct: number
  day_ahead_check: (Score & { from: string; to: string; source: string }) | { error: string }
  by_weather: { class: Weather; days: number; p50_mape_pct: number; p90_hit_rate: number; trust: 'High' | 'Medium' | 'Low' }[]
  weather_class_rules: Record<Weather, string>
  wettest_week: {
    start: string
    end: string
    rain_mm: number
    delivered_mwh: number
    shortfall_if_p50_mwh: number
    shortfall_if_p90_mwh: number
    /** same shortfalls per kWp, for rescaling to any portfolio */
    shortfall_if_p50_kwh_kwp?: number
    shortfall_if_p90_kwh_kwp?: number
    promised_p50_mwh: number
    promised_p90_mwh: number
  }
  sample_window: SampleDay[]
  feature_importance: { feature: string; share: number }[]
}

export const WEATHER_LABEL: Record<Weather, string> = { sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm' }

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
