import { AlertTriangle } from 'lucide-react';

const MESSAGES = [
  'Late spawn. Area already looted.',
  'Bastion passed through. Nothing survived.',
  'Bombardiers redecorated this area.',
  'No loot detected.',
];

export function NotFound() {
  const randomMessage = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  return (
    <div className="content-container">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          textAlign: 'center',
          padding: '48px 24px',
        }}
      >
        <AlertTriangle
          size={80}
          style={{
            color: '#ff6b6b',
            marginBottom: '24px',
            opacity: 0.9,
          }}
        />
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 700,
            color: '#e0e0e0',
            marginBottom: '16px',
            fontFamily: "'Urbanist', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          404
        </h1>
        <p
          style={{
            fontSize: '20px',
            color: '#4fc3f7',
            marginBottom: '12px',
            fontWeight: 500,
          }}
        >
          {randomMessage}
        </p>
        <p
          style={{
            fontSize: '14px',
            color: '#888',
            maxWidth: '400px',
            lineHeight: '1.6',
          }}
        >
          The page you're looking for doesn't exist.<br/>Head back to Speranza.
        </p>
      </div>
    </div>
  );
}
