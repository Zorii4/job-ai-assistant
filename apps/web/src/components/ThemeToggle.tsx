export type VisualTheme = 'light' | 'dark';

export function ThemeToggle({ theme, onChange }: { theme: VisualTheme; onChange: (theme: VisualTheme) => void }) {
  return <div className="theme-toggle" role="group" aria-label="Цветовая тема"><button className="button button--secondary button--small theme-toggle__button" type="button" aria-pressed={theme === 'light'} onClick={() => onChange('light')}>Светлая</button><button className="button button--secondary button--small theme-toggle__button" type="button" aria-pressed={theme === 'dark'} onClick={() => onChange('dark')}>Тёмная</button></div>;
}
