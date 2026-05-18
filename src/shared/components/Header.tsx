import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { LoginButton } from './LoginButton';
import { useLocale } from '../context/LocaleContext';

const TOOLS = [
  { path: '/', nameKey: 'app.name' },
  { path: '/schedule', nameKey: 'shared.tools.schedule' },
  { path: '/craft-calculator', nameKey: 'shared.tools.craftCalculator' },
  { path: '/quests', nameKey: 'shared.tools.quests' },
  { path: '/loot-helper', nameKey: 'shared.tools.lootHelper' },
  { path: '/quartermaster', nameKey: 'shared.tools.quartermaster' },
];

const TOOLS_FOR_SWITCHER = TOOLS.filter((tool) => tool.path !== '/');

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function Header() {
  const { locale, localeOptions, setLocale, t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

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

  const handleToolSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleLocaleSelect = (nextLocale: typeof locale) => {
    setLocale(nextLocale);
    setIsLanguageOpen(false);
  };

  return (
    <div className="app-header">
      <h1>
        <span className="brand-name">ARC Raiders</span>
        <span className="app-name">{t(currentTool.nameKey)}</span>
      </h1>
      <div className="header-actions">
        <div className="header-dropdown" ref={dropdownRef}>
          <button className="tool-switcher" onClick={() => setIsOpen(!isOpen)}>
            <span>{t('shared.header.switchTool')}</span> <ChevronDown size={16} />
          </button>
        {isOpen && (
          <div className="header-menu">
            {TOOLS_FOR_SWITCHER.map((tool) => (
              <button
                key={tool.path}
                onClick={() => handleToolSelect(tool.path)}
                className={`header-menu-item ${
                  tool.path === currentPathname ? 'header-menu-item--active' : ''
                }`}
              >
                {t(tool.nameKey)}
              </button>
            ))}
          </div>
        )}
        </div>
        <div className="header-dropdown" ref={languageDropdownRef}>
          <button
            className="tool-switcher"
            onClick={() => setIsLanguageOpen(!isLanguageOpen)}
            aria-label={t('shared.header.switchLanguage')}
          >
            <span className="tool-switcher-flag">{currentLocaleOption.flag}</span> <ChevronDown size={16} />
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
