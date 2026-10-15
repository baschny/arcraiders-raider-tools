import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { formatDate, useText } from './text';
import { updatePath, whatsNewPathOfMajor } from './routing';
import { UPDATE_SECTIONS, type UpdateSummary } from './types';

/** Releases grouped by their major update, newest first. */
export function UpdatesListPage({ releases }: { releases: UpdateSummary[] }) {
  const { t, locale, format, text } = useText();
  const newestFirst = [...releases].reverse();
  const majors: { id: string; title: string; releases: UpdateSummary[] }[] = [];
  for (const r of newestFirst) {
    let group = majors.find((m) => m.id === r.major);
    if (!group) {
      group = { id: r.major, title: releases.find((x) => x.id === r.major)?.title ?? r.major, releases: [] };
      majors.push(group);
    }
    group.releases.push(r);
  }

  return (
    <div className="up-page up-page--list">
      <header className="up-page__header">
        <h1 className="up-page__title">{t('updates.title')}</h1>
        <p className="up-page__summary">{t('updates.subtitle')}</p>
      </header>
      {majors.map((m) => (
        <section key={m.id} className="up-major">
          <h2 className="up-major__title">{m.title}</h2>
          <ul className="up-list">
            {m.releases.map((r) => (
              <li key={r.id} className="up-list__item">
                <Link to={updatePath(r.slug)} className="up-list__link">
                  <span className="up-page__meta">
                    <span className={`up-kind up-kind--${r.kind}`}>{t(`updates.kinds.${r.kind}`)}</span>
                    <time dateTime={r.date}>{formatDate(r.date, locale)}</time>
                  </span>
                  <span className="up-list__title">{r.title}</span>
                  <span className="up-list__summary">{text(r.summary)}</span>
                  <span className="up-list__counts">
                    {!!r.counts.findings && (
                      <span className="up-chip up-chip--findings">
                        {t('updates.findings.title')} <strong>{r.counts.findings}</strong>
                      </span>
                    )}
                    {UPDATE_SECTIONS.filter((s) => s !== 'highlights' && r.counts[s]).map((s) => (
                      <span key={s} className="up-chip">
                        {t(`updates.sections.${s}`)} <strong>{r.counts[s]}</strong>
                      </span>
                    ))}
                  </span>
                </Link>
                {r.kind === 'major' && whatsNewPathOfMajor(r.id) && (
                  <Link to={whatsNewPathOfMajor(r.id)!} className="up-list__guide">
                    <Sparkles size={16} />
                    {format('updates.guideLink', { version: r.version ?? r.title })}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
