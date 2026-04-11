import { useLocale } from '../context/LocaleContext';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const { t } = useLocale();
  return (
    <div className="loading-container">
      <div className="loading-spinner" />
      <div className="loading-text">{message ?? t('shared.loading')}</div>
    </div>
  );
}
