import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

// Colors mirror global.css variables exactly
export const THEME = {
  light: {
    background: 'hsl(40 30% 97%)',
    foreground: 'hsl(20 8% 14%)',
    card: 'hsl(40 33% 99%)',
    cardForeground: 'hsl(20 8% 14%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(20 8% 14%)',
    primary: 'hsl(142 33% 35%)',
    primaryForeground: 'hsl(40 33% 99%)',
    secondary: 'hsl(40 25% 93%)',
    secondaryForeground: 'hsl(142 33% 30%)',
    muted: 'hsl(38 20% 92%)',
    mutedForeground: 'hsl(20 6% 40%)',
    accent: 'hsl(28 70% 49%)',
    accentForeground: 'hsl(40 33% 99%)',
    destructive: 'hsl(0 72% 51%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(36 18% 86%)',
    input: 'hsl(36 18% 86%)',
    ring: 'hsl(142 33% 35%)',
    radius: '0.75rem',
  },
  dark: {
    background: 'hsl(0 0% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    card: 'hsl(0 0% 3.9%)',
    cardForeground: 'hsl(0 0% 98%)',
    popover: 'hsl(0 0% 3.9%)',
    popoverForeground: 'hsl(0 0% 98%)',
    primary: 'hsl(0 0% 98%)',
    primaryForeground: 'hsl(0 0% 9%)',
    secondary: 'hsl(0 0% 14.9%)',
    secondaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(0 0% 14.9%)',
    mutedForeground: 'hsl(0 0% 63.9%)',
    accent: 'hsl(0 0% 14.9%)',
    accentForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(0 0% 14.9%)',
    input: 'hsl(0 0% 14.9%)',
    ring: 'hsl(0 0% 83.1%)',
    radius: '0.5rem',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};