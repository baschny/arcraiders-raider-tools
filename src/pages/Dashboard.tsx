import { Link } from 'react-router-dom';
import { Calendar, Calculator, ListTodo, Package } from 'lucide-react';

const TOOLS = [
  {
    path: '/schedule',
    icon: Calendar,
    name: 'Event Schedule',
    description: 'Visualize the ARC Raiders map events schedule to plan your raids.',
  },
  {
    path: '/craft-calculator',
    icon: Calculator,
    name: 'Craft Calculator',
    description: 'Calculate crafting requirements and material needs.',
  },
  {
    path: '/quests',
    icon: ListTodo,
    name: 'Quest Tracker',
    description: 'Track your quest progress with an interactive quest tree.',
  },
  {
    path: '/loot-helper',
    icon: Package,
    name: 'Looting Helper',
    description: 'Visualize crafting chains to know what to loot during raids.',
  },
];

export function Dashboard() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#e0e0e0',
            marginBottom: '12px',
            fontFamily: "'Urbanist', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '1.1px',
          }}
        >
          Raider Tools
        </h2>
        <p style={{ fontSize: '14px', color: '#888', lineHeight: '1.6' }}>
          Welcome to the unified ARC Raiders tools collection. Choose a tool below to get started.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        {TOOLS.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              background: '#2c2c2c',
              border: '2px solid #444',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#e0e0e0',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#4fc3f7';
              e.currentTarget.style.background = '#3c3c3c';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#444';
              e.currentTarget.style.background = '#2c2c2c';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <tool.icon
              size={48}
              style={{ color: '#4fc3f7', marginBottom: '16px' }}
            />
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                marginBottom: '8px',
                color: '#e0e0e0',
              }}
            >
              {tool.name}
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: '#888',
                lineHeight: '1.5',
                margin: 0,
              }}
            >
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
