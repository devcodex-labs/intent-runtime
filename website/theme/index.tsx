import {Layout as BaseLayout} from '@rspress/core/theme-original';
import {IconMoon, IconSun} from '@rspress/core/theme-original';
import {ThemeContext} from '@rspress/core/runtime';
import {useContext} from 'react';
export * from '@rspress/core/theme-original';

export function Layout() {
  return <BaseLayout />;
}

export function SwitchAppearance({onClick}: {onClick?: () => void}) {
  const {theme, setTheme} = useContext(ThemeContext);
  const dark = theme === 'dark';
  const Icon = dark ? IconSun : IconMoon;
  return <button type="button" className="intent-theme-toggle" aria-label={dark ? '切换到浅色模式' : '切换到深色模式'} aria-pressed={dark} onClick={() => {setTheme?.(dark ? 'light' : 'dark'); onClick?.();}}>
    <Icon width={18} height={18} aria-hidden="true" />
  </button>;
}
