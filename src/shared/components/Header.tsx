import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const TOOLS = [
  { path: '/', name: 'Dashboard' },
  { path: '/schedule', name: 'Event Schedule' },
  { path: '/craft-calculator', name: 'Craft Calculator' },
  { path: '/quests', name: 'Quest Tracker' },
  { path: '/loot-helper', name: 'Looting Helper' },
];

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTool = TOOLS.find((tool) => tool.path === location.pathname) || TOOLS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToolSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <div className="app-header">
      <h1>
        <span className="brand-name">ARC Raiders</span>
        <span className="app-name">{currentTool.name}</span>
      </h1>
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <button className="tool-switcher" onClick={() => setIsOpen(!isOpen)}>
          Switch Tool <ChevronDown size={16} />
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              background: '#2c2c2c',
              border: '1px solid #555',
              borderRadius: '4px',
              minWidth: '200px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
            }}
          >
            {TOOLS.map((tool) => (
              <button
                key={tool.path}
                onClick={() => handleToolSelect(tool.path)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  background: tool.path === location.pathname ? '#3c3c3c' : 'transparent',
                  border: 'none',
                  color: tool.path === location.pathname ? '#4fc3f7' : '#e0e0e0',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (tool.path !== location.pathname) {
                    (e.target as HTMLElement).style.background = '#3c3c3c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (tool.path !== location.pathname) {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {tool.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
