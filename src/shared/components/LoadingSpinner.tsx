interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="loading-container">
      <div className="loading-spinner" />
      <div className="loading-text">{message}</div>
    </div>
  );
}
