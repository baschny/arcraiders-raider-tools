import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, ExternalLink, Map as MapIcon, ScrollText, SearchCheck, Sparkles } from 'lucide-react';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { Breadcrumb } from './components/Breadcrumb';
import { SectionBody } from './components/Records';
import { ItemOverlayProvider } from './components/ItemOverlay';
import { useItemOverlay } from './components/overlayContext';
import { RefName, RefTile } from './components/Values';
import { formatDate, useText } from './text';
import { useItems, useUpdateRelease } from './hooks/useUpdates';
import { UPDATE_SECTIONS, type UpdateHighlight, type UpdateLink, type UpdateRelease, type UpdateSummary } from './types';
import { whatsNewPathOfMajor } from './routing';

/**
 * One highlight: a fixed 48 px slot (the first item's icon, or a glyph for maps, quests and the
 * rest), the text, and the names of the records it refers to. Every row has the same height.
 */
/** Label of an official source link. */
function linkLabel(link: UpdateLink, t: (key: string) => string): string {
  const kind = t(`updates.links.${link.type}`);
  return link.title ? `${kind}: ${link.title}` : kind;
}

function Highlight({ highlight, release }: { highlight: UpdateHighlight; release: UpdateRelease }) {
  const { items } = useItemOverlay();
  const { text } = useText();
  // The slot shows the first item the catalog has an icon for; anything else gets a glyph.
  const itemRef = highlight.refs.find((r) => (r.startsWith('item:') && items[r.slice(5)]) || release.refs[r]?.icon);
  const first = highlight.refs[0];
  const Glyph = first?.startsWith('map:') ? MapIcon : first?.startsWith('quest:') ? ScrollText : Sparkles;
  return (
    <li className="up-highlight">
      <span className="up-highlight__slot">
        {itemRef ? <RefTile refKey={itemRef} release={release} size={48} hideName /> : <span className="up-highlight__glyph"><Glyph size={22} /></span>}
      </span>
      <span className="up-highlight__body">
        <span className="up-highlight__text">{text(highlight.text)}</span>
        {highlight.refs.length > 0 && (
          <span className="up-highlight__refs">
            {highlight.refs.map((r, i) => (
              <span key={r}>{i > 0 && ', '}<RefName refKey={r} release={release} /></span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

type ChangeSection = Exclude<(typeof UPDATE_SECTIONS)[number], 'highlights'>;

/** A section the What's New guide already covers: its count and a link to the guide tab. */
function GuideSection({ section, guide }: { section: ChangeSection; guide: { path: string; count: number } }) {
  const { t, format } = useText();
  return (
    <section className="up-section" id={section}>
      <h2 className="up-section__title">
        {t(`updates.sections.${section}`)} <span className="up-count">{guide.count}</span>
      </h2>
      <Link className="up-guide" to={guide.path}>
        <span className="up-highlight__glyph"><BookOpen size={22} /></span>
        <span className="up-guide__text">
          <span className="up-guide__title">{t('updates.guide.title')}</span>
          <span className="up-guide__sub">{format('updates.guide.sub', { n: guide.count })}</span>
        </span>
        <ChevronRight size={18} />
      </Link>
    </section>
  );
}

function Section({ section, release }: { section: ChangeSection; release: UpdateRelease }) {
  const { t, format, text } = useText();
  const guide = release.guideSections?.[section];
  if (guide) return <GuideSection section={section} guide={guide} />;
  const entries = release.sections[section]!;
  const note = release.notes?.[section];
  return (
    <section className="up-section" id={section}>
      <h2 className="up-section__title">
        {t(`updates.sections.${section}`)} <span className="up-count">{entries.length}</span>
      </h2>
      {section === 'loot' && <p className="up-section__intro">{t('updates.lootIntro')}</p>}
      {note?.note && <p className="up-section__intro">{text(note.note)}</p>}
      {note?.link?.app === 'quests' && (
        <Link className="up-section__applink" to={`/quests?version=${encodeURIComponent(note.link.version)}`}>
          <ScrollText size={16} />
          {format('updates.questsLink', { version: note.link.version })}
          <ChevronRight size={16} />
        </Link>
      )}
      <SectionBody section={section} entries={entries} release={release} />
    </section>
  );
}

export function UpdatePage({ summary }: { summary: UpdateSummary }) {
  const { t, locale, format, text } = useText();
  const { data: release, loading, error } = useUpdateRelease(summary.id);
  const items = useItems();

  useEffect(() => {
    document.querySelector('.main-content')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [summary.id]);

  if (loading || items.loading) return <LoadingSpinner message={t('updates.loading')} />;
  if (error || !release) return <ErrorDisplay message={error ?? t('shared.errorPrefix')} />;

  const whatsNew = release.kind === 'major' ? whatsNewPathOfMajor(release.id) : null;
  const sections = UPDATE_SECTIONS.filter((s) => s !== 'highlights' && (release.sections[s]?.length || release.guideSections?.[s])) as ChangeSection[];
  const countOf = (s: ChangeSection) => release.guideSections?.[s]?.count ?? release.sections[s]?.length ?? 0;

  return (
    <ItemOverlayProvider items={items.data ?? {}}>
      <article className="up-page" lang={locale}>
        <Breadcrumb crumbs={[{ label: release.title }]} />
        <header className="up-page__header">
          <p className="up-page__meta">
            <span className={`up-kind up-kind--${release.kind}`}>{t(`updates.kinds.${release.kind}`)}</span>
            <time dateTime={release.date}>{formatDate(release.date, locale)}</time>
            {release.kind !== 'major' && <span className="up-page__major">{release.majorTitle}</span>}
          </p>
          <h1 className="up-page__title">{release.title}</h1>
          <p className="up-page__summary">{text(release.summary)}</p>
          <p className="up-page__links">
            {release.links.map((link) => (
              <a key={link.url} className={`up-link up-link--${link.type}`} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.type === 'x' ? <span className="up-link__x" aria-hidden="true">𝕏</span> : <ExternalLink size={14} />}
                {linkLabel(link, t)}
              </a>
            ))}

          </p>
        </header>

        {whatsNew && (
          <Link className="up-cta" to={whatsNew}>
            <span className="up-cta__glyph"><Sparkles size={26} /></span>
            <span className="up-cta__text">
              <span className="up-cta__title">{format('updates.guideLink', { version: release.version ?? release.title })}</span>
              <span className="up-cta__sub">{t('updates.guideCta')}</span>
            </span>
            <ChevronRight size={22} className="up-cta__arrow" />
          </Link>
        )}

        {release.highlights.length > 0 && (
          <section className="up-section up-section--highlights" id="highlights">
            <h2 className="up-section__title">{t('updates.sections.highlights')}</h2>
            <ul className="up-highlights">
              {release.highlights.map((h) => <Highlight key={h.text.en} highlight={h} release={release} />)}
            </ul>
          </section>
        )}

        {release.findings.length > 0 && (
          <section className="up-section up-section--findings" id="findings">
            <h2 className="up-section__title">
              <SearchCheck size={22} className="up-section__icon" />
              {t('updates.findings.title')}
            </h2>
            <p className="up-section__intro">{t('updates.findings.intro')}</p>
            <ul className="up-highlights up-highlights--findings">
              {release.findings.map((h) => <Highlight key={h.text.en} highlight={h} release={release} />)}
            </ul>
          </section>
        )}

        {sections.length > 0 && (
          <nav className="up-toc" aria-label={t('updates.contents')}>
            {sections.map((s) => (
              <a key={s} href={`#${s}`} className="up-toc__link">
                {t(`updates.sections.${s}`)} <span className="up-count">{countOf(s)}</span>
              </a>
            ))}
          </nav>
        )}

        {sections.map((s) => <Section key={s} section={s} release={release} />)}
      </article>
    </ItemOverlayProvider>
  );
}
