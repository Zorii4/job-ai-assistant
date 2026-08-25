import { Moon, Sun } from 'lucide-react';

import { IconButton } from './IconButton';

export type VisualTheme = 'light' | 'dark';

export function ThemeToggle({ theme, onChange }: { theme: VisualTheme; onChange: (theme: VisualTheme) => void }) {
  return <div className="theme-toggle" role="group" aria-label="Цветовая тема"><IconButton className="theme-toggle__button" type="button" label="Светлая тема" showTooltip={false} aria-pressed={theme === 'light'} onClick={() => onChange('light')}><Sun aria-hidden="true" size={18} /></IconButton><IconButton className="theme-toggle__button" type="button" label="Тёмная тема" showTooltip={false} aria-pressed={theme === 'dark'} onClick={() => onChange('dark')}><Moon aria-hidden="true" size={18} /></IconButton></div>;
}
