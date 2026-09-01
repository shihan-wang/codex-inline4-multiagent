export const OPERATING_LIMITS = {
  rpm: { min: 400, max: 3600, idle: 780, initial: 1200 },
  load: { min: 0, max: 1, initial: 0.42 },
  coolantC: { ambient: 24, nominal: 88, warning: 103 },
  oilPressureBar: { idle: 1.4, nominal: 4.2, maximum: 6.0 },
} as const;

export const FIRING_ORDER = [1, 3, 4, 2] as const;

export const VIEW_MODES = ['solid', 'xray', 'section'] as const;
