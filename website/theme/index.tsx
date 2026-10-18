import {IconMoon, IconSun, IconSearch, NavTitle, NavList, SocialLinks, SearchPanel} from '@rspress/core/theme-original';
import {ThemeContext, NoSSR, useI18n, useLang, useLocation, useNav, usePage, usePages, withBase} from '@rspress/core/runtime';
import {useContext, useEffect, useId, useRef, useState} from 'react';
import '@rspress/core/dist/theme/components/Search/SearchButton.css';
import '@rspress/core/dist/theme/components/Nav/index.css';
import {base} from '../site';
export * from '@rspress/core/theme-original';

export function Nav() {
  const items = useNav(), chinese = useLang() === 'zh';
  const {pathname} = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null), wasOpen = useRef(false);
  useEffect(() => {setOpen(false);}, [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {if (!root.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open) {wasOpen.current = true; panel.current?.querySelector<HTMLAnchorElement>('a')?.focus();}
    else if (wasOpen.current) {wasOpen.current = false; trigger.current?.focus();}
  }, [open]);
  return <header ref={root} className="rp-nav intent-nav" onKeyDown={event => {
    if (event.key === 'Escape' && open && !event.defaultPrevented) {event.preventDefault(); setOpen(false);}
  }}>
    <div className="rp-nav__left"><NavTitle /></div>
    <div className="intent-nav-tools">
      <Search />
      <nav className="intent-primary-nav" aria-label={chinese ? '主导航' : 'Main navigation'}><NavList items={items} /></nav>
      <div className="intent-desktop-language"><LanguageSwitch /></div>
      <div className="intent-desktop-tools"><SwitchAppearance /><SocialLinks /></div>
      <button ref={trigger} type="button" className="intent-mobile-toggle" aria-label={chinese ? (open ? '关闭导航菜单' : '打开导航菜单') : (open ? 'Close navigation menu' : 'Open navigation menu')} aria-expanded={open} aria-controls="intent-mobile-nav" onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? '×' : '☰'}</span></button>
    </div>
    {open && <nav ref={panel} id="intent-mobile-nav" className="intent-mobile-nav" aria-label={chinese ? '移动导航' : 'Mobile navigation'} onClick={event => {if ((event.target as HTMLElement).closest('a')) setOpen(false);}}>
      <NavList items={items} />
      <LanguageSwitch inline />
      <div className="intent-mobile-tools"><span>{chinese ? '外观' : 'Appearance'}</span><SwitchAppearance /><SocialLinks /></div>
    </nav>}
  </header>;
}

function LanguageSwitch({inline = false}: {inline?: boolean}) {
  const chinese = useLang() === 'zh';
  const {pathname, search, hash} = useLocation();
  const {page: pageData} = usePage();
  const {pages} = usePages();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const page = pageData.pageType === '404' ? '' : relative.replace(/^zh(?:\/|$)/, '');
  const normalize = (path: string) => path.replace(/(?:index)?\.html$/, '').replace(/\/$/, '');
  const choices = [{lang: 'en', label: 'English'}, {lang: 'zh', label: '简体中文'}].map(item => {
    const desired = withBase('/' + (item.lang === 'zh' ? 'zh/' : '') + page);
    const exists = pages.some(entry => normalize(withBase(entry.routePath)) === normalize(desired));
    return {...item, href: (exists ? desired : withBase(item.lang === 'zh' ? '/zh/' : '/')) + search};
  });
  useEffect(() => {setOpen(false);}, [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {if (!root.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  // Keep fragments only after checking the target document, including legacy anchors.
  async function navigate(event: React.MouseEvent<HTMLAnchorElement>, target: string) {
    if (!hash || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    let fragment = '';
    try {
      const response = await fetch(target);
      if (response.ok && new DOMParser().parseFromString(await response.text(), 'text/html').getElementById(decodeURIComponent(hash.slice(1)))) fragment = hash;
    } catch {/* The corresponding page remains usable if fragment verification fails. */}
    window.location.assign(target + fragment);
  }
  const options = choices.map(item => <a key={item.lang} href={item.href} hrefLang={item.lang} lang={item.lang} rel="alternate" aria-current={item.lang === (chinese ? 'zh' : 'en') ? 'page' : undefined} onClick={event => {void navigate(event, item.href);}}>{item.label}<span aria-hidden="true">{item.lang === (chinese ? 'zh' : 'en') ? '✓' : ''}</span></a>);
  return <div ref={root} className={inline ? 'intent-language-inline' : 'intent-language'} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);}} onKeyDown={event => {
    if (event.key === 'Escape' && open) {event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();}
  }}>
    {inline ? <><span>{chinese ? '语言' : 'Language'}</span><div>{options}</div></> : <>
      <button ref={trigger} type="button" aria-label={chinese ? '语言：简体中文' : 'Language: English'} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === 'ArrowDown') {event.preventDefault(); setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLAnchorElement>('a')?.focus());}
      }}>{chinese ? '简体中文' : 'English'}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></button>
      <div id={id} className="intent-language-options" hidden={!open}>{options}</div>
    </>}
  </div>;
}

export function SwitchAppearance({onClick}: {onClick?: () => void}) {
  const {theme, setTheme} = useContext(ThemeContext);
  const chinese = useLang() === 'zh';
  const [mounted, setMounted] = useState(false);
  useEffect(() => {setMounted(true);}, []);
  const dark = mounted && theme === 'dark';
  const Icon = dark ? IconSun : IconMoon;
  return <button type="button" className="intent-theme-toggle" aria-label={chinese ? (dark ? '切换到浅色模式' : '切换到深色模式') : (dark ? 'Switch to light mode' : 'Switch to dark mode')} aria-pressed={dark} onClick={() => {setTheme?.(dark ? 'light' : 'dark'); onClick?.();}}>
    <Icon width={18} height={18} aria-hidden="true" />
  </button>;
}

// Keep native search/indexing; restore the user's focus when the panel closes.
export function Search() {
  const [focused, setFocused] = useState(false);
  const t = useI18n();
  const trigger = useRef<HTMLButtonElement>(null), mobile = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null), opened = useRef(false);
  const changeFocused = (next: boolean) => {
    if (next && !focused && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) returnTo.current = document.activeElement;
    setFocused(next);
  };
  useEffect(() => {
    if (focused) {opened.current = true; return;}
    if (!opened.current) return;
    opened.current = false;
    const frame = requestAnimationFrame(() => {
      const previous = returnTo.current;
      const fallback = trigger.current?.getClientRects().length ? trigger.current : mobile.current;
      (previous?.isConnected && previous.getClientRects().length ? previous : fallback)?.focus();
      returnTo.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  const label = t('searchPlaceholderText');
  return <>
    <button ref={trigger} type="button" className="rp-search-button" aria-label={label} onClick={() => changeFocused(true)}><span className="rp-search-button__content"><IconSearch width={18} height={18} aria-hidden="true" /><span className="rp-search-button__word">{label}</span></span><span className="rp-search-button__hotkey">Ctrl K</span></button>
    <button ref={mobile} type="button" className="rp-search-button--mobile" aria-label={label} onClick={() => changeFocused(true)}><IconSearch width={20} height={20} aria-hidden="true" /></button>
    <NoSSR><SearchPanel focused={focused} setFocused={changeFocused} /></NoSSR>
  </>;
}
