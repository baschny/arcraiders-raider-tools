import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Calculator,
  Calendar,
  ChevronDown,
  ClipboardList,
  Home,
  ListTodo,
  Menu,
  Package,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { LoginButton } from './LoginButton';
import { useLocale } from '../context/LocaleContext';

const TOOLS = [
  { path: '/', nameKey: 'app.name', icon: Home },
  { path: '/schedule', nameKey: 'shared.tools.schedule', icon: Calendar },
  { path: '/craft-calculator', nameKey: 'shared.tools.craftCalculator', icon: Calculator },
  { path: '/quests', nameKey: 'shared.tools.quests', icon: ListTodo },
  { path: '/loot-helper', nameKey: 'shared.tools.lootHelper', icon: Package },
  { path: '/quartermaster', nameKey: 'shared.tools.quartermaster', icon: ClipboardList },
];

const TOOLS_FOR_SWITCHER = TOOLS.filter((tool) => tool.path !== '/');
const MOBILE_SCROLL_THRESHOLD_PX = 4;

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function Header() {
  const { locale, localeOptions, setLocale, t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isHiddenOnScroll, setIsHiddenOnScroll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const scrollTargetRef = useRef<EventTarget | null>(null);

  const currentPathname = normalizePathname(location.pathname);
  const currentTool = TOOLS.find((tool) => tool.path === currentPathname) || TOOLS[0];
  const currentLocaleOption =
    localeOptions.find((option) => option.code === locale) ?? localeOptions[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLanguageOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 700px)');

    const reset = () => {
      scrollTargetRef.current = null;
      lastScrollTopRef.current = 0;
      setIsHiddenOnScroll(false);
    };

    const getScrollTop = (target: EventTarget | null): number =>
      target instanceof HTMLElement ? target.scrollTop : window.scrollY;

    const handleScroll = (event: Event) => {
      if (!mobileQuery.matches) return;

      const target = event.target;
      const scrollTop = getScrollTop(target);
      if (scrollTargetRef.current !== target) {
        scrollTargetRef.current = target;
        lastScrollTopRef.current = scrollTop;
        return;
      }

      const difference = scrollTop - lastScrollTopRef.current;
      if (scrollTop <= MOBILE_SCROLL_THRESHOLD_PX) {
        setIsHiddenOnScroll(false);
        lastScrollTopRef.current = scrollTop;
      } else if (Math.abs(difference) >= MOBILE_SCROLL_THRESHOLD_PX) {
        setIsHiddenOnScroll(difference > 0);
        lastScrollTopRef.current = scrollTop;
      }
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    mobileQuery.addEventListener('change', reset);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      mobileQuery.removeEventListener('change', reset);
    };
  }, []);

  const handleToolSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleLocaleSelect = (nextLocale: typeof locale) => {
    setLocale(nextLocale);
    setIsLanguageOpen(false);
  };

  return (
    <div className={`app-header ${isHiddenOnScroll ? 'app-header--hidden' : ''}`}>
      <h1>
        <Link className="brand-logo" to="/" aria-label={t('app.name')}>
          <img src="/favicon.svg" alt="" />
        </Link>
        <span className="brand-name">ARC Raiders</span>
        <span className="app-name">{t(currentTool.nameKey)}</span>
      </h1>
      <div className="header-actions">
        <div className="header-dropdown" ref={dropdownRef}>
          <button className="tool-switcher" onClick={() => setIsOpen(!isOpen)}>
            <Menu className="tool-switcher-menu-icon" size={18} />
            <span className="tool-switcher-label">{t('shared.header.switchTool')}</span>
            <ChevronDown className="tool-switcher-chevron" size={16} />
          </button>
        {isOpen && (
          <div className="header-menu">
            {TOOLS_FOR_SWITCHER.map((tool) => {
              const ToolIcon = tool.icon;
              return (
              <button
                key={tool.path}
                onClick={() => handleToolSelect(tool.path)}
                className={`header-menu-item ${
                  tool.path === currentPathname ? 'header-menu-item--active' : ''
                }`}
              >
                <ToolIcon size={18} />
                {t(tool.nameKey)}
              </button>
              );
            })}
          </div>
        )}
        </div>
        <div className="header-dropdown" ref={languageDropdownRef}>
          <button
            className="tool-switcher"
            onClick={() => setIsLanguageOpen(!isLanguageOpen)}
            aria-label={t('shared.header.switchLanguage')}
          >
            <span className="tool-switcher-flag">{currentLocaleOption.flag}</span>
            <ChevronDown className="tool-switcher-chevron" size={16} />
          </button>
          {isLanguageOpen && (
            <div className="header-menu">
              {localeOptions.map((option) => (
                <button
                  key={option.code}
                  onClick={() => handleLocaleSelect(option.code)}
                  className={`header-menu-item ${
                    option.code === locale ? 'header-menu-item--active' : ''
                  }`}
                >
                  <span className="header-menu-item-flag">{option.flag}</span>
                  <span className="header-menu-item-language">{option.nativeLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <LoginButton />
      </div>
    </div>
  );
}
