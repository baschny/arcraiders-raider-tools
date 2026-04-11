import { useLocale } from '../context/LocaleContext';

interface ErrorDisplayProps {
  message: string;
}

export function ErrorDisplay({ message }: ErrorDisplayProps) {
  const { t } = useLocale();
  return (
    <div className="error-container">
      <div className="error-text">{t('shared.errorPrefix')}: {message}</div>
    </div>
  );
}
