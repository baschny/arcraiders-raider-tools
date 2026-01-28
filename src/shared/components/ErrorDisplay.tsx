interface ErrorDisplayProps {
  message: string;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  return (
    <div className="error-container">
      <div className="error-text">Error: {message}</div>
    </div>
  );
}
