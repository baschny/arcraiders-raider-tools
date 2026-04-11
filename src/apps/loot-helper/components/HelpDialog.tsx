import { useEffect } from 'react';
import { Youtube } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const { t } = useLocale();
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="help-dialog-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-dialog-header">
          <h2>{t('lootHelper.help.title')}</h2>
          <button className="help-dialog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="help-dialog-content">
          <section>
            <h3>{t('lootHelper.help.videoTitle')}</h3>
            <p>
              <a href="https://youtu.be/wePdXVwQ4pk" target="_blank" rel="noopener noreferrer" className="video-link">
                <Youtube size={20} />
                {t('lootHelper.help.videoLink')}
              </a>
            </p>
          </section>

          <section>
            <h3>{t('lootHelper.help.step1Title')}</h3>
            <p>{t('lootHelper.help.step1Body')}</p>
          </section>
          
          <section>
            <h3>{t('lootHelper.help.step2Title')}</h3>
            <p>{t('lootHelper.help.step2Body')}</p>
          </section>
          
          <section>
            <h3>{t('lootHelper.help.step3Title')}</h3>
            <p>{t('lootHelper.help.step3Body')}</p>
          </section>
          
          <section>
            <h3>{t('lootHelper.help.step4Title')}</h3>
            <p>{t('lootHelper.help.step4Body')}</p>
          </section>

          <div className="help-dialog-example">
            <h3>{t('lootHelper.help.exampleTitle')}</h3>
            <p>{t('lootHelper.help.exampleBody')}</p>
          </div>

          <div className="help-dialog-note">
            <p><strong>{t('lootHelper.help.noteLabel')}</strong> {t('lootHelper.help.noteBody')}</p>
          </div>

          <section>
            <h3>{t('lootHelper.help.learningTitle')}</h3>
            <p>{t('lootHelper.help.learningBody')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
