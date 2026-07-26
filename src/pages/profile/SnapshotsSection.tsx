import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useLocale } from '../../shared/context/LocaleContext';
import { createQuartermasterSnapshot, deleteQuartermasterSnapshot, listQuartermasterSnapshots, restoreQuartermasterSnapshot } from '../../shared/services/userApi';
import { applyRestoredQuartermasterSnapshot, captureCurrentQuartermasterSnapshot, type SnapshotCaptureResult } from '../../shared/services/quartermasterSnapshots';
import type { QuartermasterSnapshotMetadata } from '../../shared/types/quartermasterSnapshots';
import { loadAllItems, loadHideoutDefinitions, loadQuestData } from '../../apps/quartermaster/utils/dataLoader';
import type { ItemsMap } from '../../apps/quartermaster/types/item';
import type { HideoutModuleDefinition } from '../../apps/quartermaster/types/hideout';
import type { Quest } from '../../shared/types/quest';

export function SnapshotsSection() {
  const { locale, t } = useLocale();
  const [snapshots, setSnapshots] = useState<QuartermasterSnapshotMetadata[]>([]);
  const [capture, setCapture] = useState<SnapshotCaptureResult>({ payload: null, missing: [], syncTimes: {} });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemsMap>({});
  const [hideoutDefinitions, setHideoutDefinitions] = useState<HideoutModuleDefinition[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSnapshots, nextCapture, nextItems, nextHideout, nextQuestData] = await Promise.all([
        listQuartermasterSnapshots(),
        captureCurrentQuartermasterSnapshot(),
        loadAllItems(locale),
        loadHideoutDefinitions(locale),
        loadQuestData(locale),
      ]);
      setSnapshots(nextSnapshots);
      setCapture(nextCapture);
      setItems(nextItems);
      setHideoutDefinitions(nextHideout);
      setQuests(nextQuestData.fullQuests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.profile.snapshots.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [locale, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canStore = Boolean(capture.payload) && snapshots.length < 100 && name.trim().length > 0 && name.trim().length <= 80 && description.length <= 500;

  const handleStore = async (): Promise<void> => {
    const nextCapture = await captureCurrentQuartermasterSnapshot();
    setCapture(nextCapture);
    if (!nextCapture.payload) return;
    setSaving(true);
    setError(null);
    try {
      const snapshot = await createQuartermasterSnapshot({
        name: name.trim(),
        description: description.trim() || null,
        payload: nextCapture.payload,
      });
      setSnapshots(current => [snapshot, ...current]);
      setName('');
      setDescription('');
      setMessage(t('pages.profile.snapshots.stored'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.profile.snapshots.storeFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (snapshot: QuartermasterSnapshotMetadata): Promise<void> => {
    if (!window.confirm(t('pages.profile.snapshots.restoreConfirm'))) return;
    setActionId(snapshot.snapshotId);
    setError(null);
    try {
      const result = await restoreQuartermasterSnapshot(snapshot.snapshotId);
      await applyRestoredQuartermasterSnapshot(result);
      setMessage(t('pages.profile.snapshots.restored'));
      setCapture(await captureCurrentQuartermasterSnapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.profile.snapshots.restoreFailed'));
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (snapshot: QuartermasterSnapshotMetadata): Promise<void> => {
    if (!window.confirm(t('pages.profile.snapshots.deleteConfirm'))) return;
    setActionId(snapshot.snapshotId);
    setError(null);
    try {
      await deleteQuartermasterSnapshot(snapshot.snapshotId);
      setSnapshots(current => current.filter(item => item.snapshotId !== snapshot.snapshotId));
      setMessage(t('pages.profile.snapshots.deleted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.profile.snapshots.deleteFailed'));
    } finally {
      setActionId(null);
    }
  };

  const summaries = useMemo(() => new Map(snapshots.map(snapshot => [snapshot.snapshotId,
    summarize(snapshot, items, hideoutDefinitions, quests),
  ])), [snapshots, items, hideoutDefinitions, quests]);

  return (
    <div className="settings-page profile-section snapshots-section">
      <h2 className="settings-title">{t('pages.profile.snapshots.title')}</h2>
      <section className="settings-section">
        <h3 className="settings-section-title">{t('pages.profile.snapshots.storeTitle')}</h3>
        <p className="snapshots-section__hint">{t('pages.profile.snapshots.storeHint')}</p>
        <div className="settings-form">
          <label className="settings-label" htmlFor="snapshot-name">{t('pages.profile.snapshots.name')}</label>
          <input id="snapshot-name" className="token-input" maxLength={80} value={name} onChange={event => setName(event.target.value)} />
          <label className="settings-label" htmlFor="snapshot-description">{t('pages.profile.snapshots.description')}</label>
          <textarea id="snapshot-description" className="snapshots-section__description" maxLength={500} value={description} onChange={event => setDescription(event.target.value)} />
          <dl className="snapshots-section__sync-times">
            {Object.entries(capture.syncTimes).map(([domain, syncTime]) => <div key={domain}><dt>{domain}</dt><dd>{syncTime ? new Date(syncTime).toLocaleString() : t('pages.profile.snapshots.notSynced')}</dd></div>)}
          </dl>
          {capture.missing.length > 0 && <p className="snapshots-section__warning">{t('pages.profile.snapshots.missing')}: {capture.missing.join(', ')}</p>}
          {snapshots.length >= 100 && <p className="snapshots-section__warning">{t('pages.profile.snapshots.limitReached')}</p>}
          <button type="button" className="settings-button settings-button--primary" disabled={!canStore || saving} onClick={() => void handleStore()}>
            {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {t('pages.profile.snapshots.store')}
          </button>
        </div>
      </section>

      {message && <p className="settings-message settings-message--success"><CheckCircle2 size={16} />{message}</p>}
      {error && <p className="settings-message settings-message--error">{error}</p>}

      <section className="settings-section">
        <h3 className="settings-section-title">{t('pages.profile.snapshots.available')}</h3>
        {loading ? <Loader2 size={24} className="spin" /> : snapshots.length === 0 ? (
          <p className="snapshots-section__hint">{t('pages.profile.snapshots.empty')}</p>
        ) : (
          <div className="snapshots-section__list">
            {snapshots.map(snapshot => {
              const summary = summaries.get(snapshot.snapshotId);
              const busy = actionId === snapshot.snapshotId;
              return <article className="snapshots-section__card" key={snapshot.snapshotId}>
                <div className="snapshots-section__card-header">
                  <div><h4>{snapshot.name}</h4><time>{new Date(snapshot.createdAt).toLocaleString()}</time></div>
                  <div className="snapshots-section__actions">
                    <button type="button" className="settings-button settings-button--primary" disabled={busy} onClick={() => void handleRestore(snapshot)}><ArchiveRestore size={16} />{t('pages.profile.snapshots.restore')}</button>
                    <button type="button" className="settings-button settings-button--danger" disabled={busy} onClick={() => void handleDelete(snapshot)}><Trash2 size={16} />{t('pages.profile.snapshots.delete')}</button>
                  </div>
                </div>
                {snapshot.description && <p>{snapshot.description}</p>}
                <dl className="snapshots-section__summary">
                  {snapshot.playerLevel !== null && <><dt>{t('pages.profile.snapshots.level')}</dt><dd>{snapshot.playerLevel}</dd></>}
                  <dt>{t('pages.profile.snapshots.ownedValue')}</dt><dd>{summary?.ownedValue.toLocaleString() ?? '0'}</dd>
                  <dt>{t('pages.profile.snapshots.quests')}</dt><dd>{summary ? `${summary.completedQuests}/${summary.totalQuests} (${summary.questPercent}%)` : '—'}</dd>
                </dl>
                {!!summary?.benches.length && <div className="snapshots-section__benches">{summary.benches.map(bench => <span key={bench}>{bench}</span>)}</div>}
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function summarize(snapshot: QuartermasterSnapshotMetadata, items: ItemsMap, definitions: HideoutModuleDefinition[], quests: Quest[]) {
  const ownedValue = Object.entries(snapshot.ownedItemQuantities).reduce((sum, [itemId, quantity]) => sum + (items[itemId]?.value ?? 0) * quantity, 0);
  const realQuests = quests.filter(quest => quest.trader !== 'Map');
  const validIds = new Set(realQuests.map(quest => quest.id));
  const completedQuests = snapshot.completedQuestIds.filter(id => validIds.has(id)).length;
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  const benches = snapshot.hideoutModules.flatMap(module => {
    const definition = byId.get(module.moduleId);
    return definition && module.moduleId !== 'stash' && module.currentLevel > 0 ? [`${definition.name} T${module.currentLevel}`] : [];
  });
  return { ownedValue, completedQuests, totalQuests: realQuests.length, questPercent: realQuests.length ? Math.round(completedQuests / realQuests.length * 100) : 0, benches };
}
