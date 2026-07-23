import { useMemo, useRef, useState } from 'react';
import type { NavRoute } from '../domain/navigation.types';
import type { ParsedNotam } from '../domain/notam.types';
import type { SupAipDatasetState } from '../hooks/useSupAipDataset';
import { usePibBriefing } from '../hooks/usePibBriefing';
import { buildSupAipPublicationCatalog, type SupAipPublicationView } from '../services/supaip/supAipCatalog';
import {
  formatSupAipDatasetTimestamp,
  supAipDatasetGeneratedTimestamp,
  supAipDatasetReferenceTimestamp,
  SUP_AIP_VERTICAL_NOTICE
} from '../services/supaip/supAipDataset';
import { formatSupAipDateRange, supAipStatusLabel } from '../services/supaip/supAipStatus';
import { openOfficialDocument } from '../services/external/officialDocument';
import { Page } from '../components/layout/Page';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { BriefingMap, notamHasMapGeometry } from '../components/briefing/BriefingMap';

interface BriefingScreenProps {
  route: NavRoute;
  alternateCode: string;
  dataset: SupAipDatasetState;
  onBack: () => void;
}

type BriefingTab = 'summary' | 'notams' | 'supaip' | 'map';
type NotamFilter = 'all' | 'route' | 'alerts' | 'supaip';

const PAGE_STEP = 16;

function formatUtc(value: string | null | undefined): string {
  if (!value) return 'Non détectée';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non interprétée';
  return `${date.toLocaleString('fr-FR', {
    timeZone: 'UTC',
    dateStyle: 'short',
    timeStyle: 'short'
  })} UTC`;
}

function formatDistance(distance: number | null): string {
  if (distance === null) return 'Distance route non calculable';
  if (distance < 1) return `À environ ${distance.toFixed(1)} NM de la route`;
  return `À environ ${Math.round(distance)} NM de la route`;
}

function routeLabel(route: NavRoute) {
  const departure = route.points.find((point) => point.type === 'depart')?.code;
  const destination = route.points.find((point) => point.type === 'destination')?.code;
  return departure && destination ? `${departure} > ${destination}` : 'Route incomplète';
}

function notamPriority(notam: ParsedNotam): boolean {
  return notam.temporalStatus === 'active'
    || notam.temporalStatus === 'complex'
    || notam.temporalStatus === 'unknown'
    || notam.interpretationStatus === 'uninterpreted'
    || notam.warnings.length > 0;
}


function routeRelevanceLabel(value: ParsedNotam['routeRelevance']): string {
  const labels: Record<ParsedNotam['routeRelevance'], string> = {
    departure: 'Départ',
    destination: 'Arrivée',
    'departure-destination': 'Départ et arrivée',
    alternate: 'Dégagement',
    route: 'Sur la route',
    outside: 'Hors route estimée',
    unknown: 'À confirmer'
  };
  return labels[value];
}

function notamMatchesFilter(notam: ParsedNotam, filter: NotamFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'route') return ['departure', 'destination', 'departure-destination', 'alternate', 'route'].includes(notam.routeRelevance);
  if (filter === 'supaip') return notam.supAipReferences.length > 0;
  return notamPriority(notam);
}

function notamStatusLabel(notam: ParsedNotam): string {
  switch (notam.temporalStatus) {
    case 'active': return 'Actif à l’heure prévue';
    case 'future': return 'À venir';
    case 'ended': return 'Terminé';
    case 'published': return 'Publié';
    case 'complex': return 'Horaire complexe';
    default: return 'À vérifier';
  }
}

function datasetSourceLabel(source: 'server' | 'cache' | 'embedded') {
  if (source === 'server') return 'Base serveur validée';
  if (source === 'cache') return 'Dernière base locale validée';
  return 'Base embarquée de secours';
}

export function BriefingScreen({ route, alternateCode, dataset, onBack }: BriefingScreenProps) {
  const [tab, setTab] = useState<BriefingTab>('summary');
  const [text, setText] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [searchSup, setSearchSup] = useState('');
  const [searchNotam, setSearchNotam] = useState('');
  const [notamFilter, setNotamFilter] = useState<NotamFilter>('all');
  const [supLimit, setSupLimit] = useState(PAGE_STEP);
  const [notamLimit, setNotamLimit] = useState(PAGE_STEP);
  const [selectedSupAipId, setSelectedSupAipId] = useState<string | null>(null);
  const [selectedNotamId, setSelectedNotamId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const briefing = usePibBriefing(route, alternateCode ? [alternateCode] : [], dataset.bundle);

  const catalog = useMemo(() => {
    if (!dataset.bundle) return [];
    return buildSupAipPublicationCatalog(dataset.bundle, route.points, briefing.analysis);
  }, [briefing.analysis, dataset.bundle, route.points]);

  const filteredSup = useMemo(() => {
    const query = searchSup.trim().toLocaleLowerCase('fr');
    if (!query) return catalog;
    return catalog.filter((publication) => [publication.id, publication.title, publication.reason ?? '']
      .some((value) => value.toLocaleLowerCase('fr').includes(query)));
  }, [catalog, searchSup]);

  const filteredNotams = useMemo(() => {
    const query = searchNotam.trim().toLocaleLowerCase('fr');
    const entries = briefing.analysis?.notams ?? [];
    return entries.filter((notam) => {
      if (!notamMatchesFilter(notam, notamFilter)) return false;
      if (!query) return true;
      return [notam.id, notam.fields.e, notam.rawText, ...notam.fields.a]
        .some((value) => value.toLocaleLowerCase('fr').includes(query));
    });
  }, [briefing.analysis, notamFilter, searchNotam]);

  const selectedSup = catalog.find((publication) => publication.id === selectedSupAipId) ?? null;
  const selectedNotam = briefing.analysis?.notams.find((notam) => notam.id === selectedNotamId) ?? null;
  const routeSupCount = catalog.filter((publication) => publication.routeRelevant).length;
  const citedSupCount = catalog.filter((publication) => publication.citedByNotam).length;
  const reviewSupCount = catalog.filter((publication) => publication.partial || publication.conservative || publication.fallback || publication.missingVerticalCount > 0).length;

  const showSupOnMap = (publication: SupAipPublicationView) => {
    setSelectedSupAipId(publication.id);
    setSelectedNotamId(null);
    setTab('map');
  };

  const showNotamOnMap = (notam: ParsedNotam) => {
    const mappedReference = notam.supAipReferences.find((reference) => {
      const item = briefing.analysis?.reconciliations.find((entry) => entry.reference.id === reference.id);
      return (item?.mappedGeometryCount ?? 0) > 0;
    });
    setSelectedSupAipId(mappedReference?.id ?? null);
    setSelectedNotamId(mappedReference ? null : notam.id);
    setTab('map');
  };

  const importPdf = async (file: File | undefined) => {
    if (!file) return;
    setLocalMessage(null);
    try {
      const result = await briefing.analyzePdf(file);
      setLocalMessage(`${result.summary.totalNotams} NOTAM analysés localement.`);
      setTab('notams');
    } catch {
      // Le hook affiche l’erreur détaillée.
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const analyzeText = async () => {
    if (!text.trim()) {
      setLocalMessage('Collez d’abord le contenu du PIB SOFIA.');
      return;
    }
    setLocalMessage(null);
    try {
      const result = await briefing.analyzeText(text);
      setLocalMessage(`${result.summary.totalNotams} NOTAM analysés localement.`);
      setTab('notams');
    } catch {
      // Le hook affiche l’erreur détaillée.
    }
  };

  const openPdf = async (url: string) => {
    setLocalMessage(null);
    try {
      await openOfficialDocument(url);
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Ouverture du document officiel impossible.');
    }
  };

  return (
    <Page className="briefing-page">
      <div className="briefing-heading">
        <Button variant="ghost" onClick={onBack}>Retour</Button>
        <div>
          <h1>Briefing aéronautique</h1>
          <p>NOTAM, SUP AIP et contrôle croisé pour {routeLabel(route)}.</p>
        </div>
      </div>

      <div className="briefing-safety-banner">
        <strong>Aide à la préparation</strong>
        <p>CAP CLAIR ne remplace pas SOFIA, le SIA, le PIB ni la préparation réglementaire. Les SUP AIP ne sont jamais masquées selon l’altitude.</p>
      </div>

      <nav className="briefing-tabs" aria-label="Sections du briefing">
        {([
          ['summary', 'Synthèse'],
          ['notams', `NOTAM${briefing.analysis ? ` (${briefing.analysis.summary.totalNotams})` : ''}`],
          ['supaip', `SUP AIP (${catalog.length})`],
          ['map', 'Carte']
        ] as Array<[BriefingTab, string]>).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {(localMessage || briefing.error) && (
        <p className={`briefing-message ${briefing.error ? 'error' : ''}`}>{briefing.error ?? localMessage}</p>
      )}

      {tab === 'summary' && (
        <div className="briefing-summary-layout">
          <Card className={`briefing-dataset-card ${dataset.stale ? 'is-stale' : ''}`}>
            <div className="briefing-card-heading">
              <div>
                <span>Base SUP AIP</span>
                <strong>{dataset.bundle ? datasetSourceLabel(dataset.bundle.source) : 'Chargement...'}</strong>
              </div>
              <Button variant="secondary" disabled={!dataset.bundle || dataset.state === 'checking' || dataset.state === 'updating'} onClick={() => void dataset.refresh()}>
                {dataset.state === 'checking' || dataset.state === 'updating' ? 'Vérification...' : 'Vérifier maintenant'}
              </Button>
            </div>
            {dataset.bundle && (
              <dl className="briefing-data-grid">
                <div><dt>Dernière modification</dt><dd>{formatSupAipDatasetTimestamp(supAipDatasetGeneratedTimestamp(dataset.bundle.status))}</dd></div>
                <div><dt>Dernier contrôle SIA</dt><dd>{formatSupAipDatasetTimestamp(supAipDatasetReferenceTimestamp(dataset.bundle.status))}</dd></div>
                <div><dt>Vérification appareil</dt><dd>{formatSupAipDatasetTimestamp(dataset.lastCheckedAtIso)}</dd></div>
                <div><dt>Révision</dt><dd>{dataset.bundle.status.datasetRevision?.slice(0, 12) ?? 'inconnue'}</dd></div>
                <div><dt>Publications</dt><dd>{dataset.bundle.status.listingPublicationCount}</dd></div>
                <div><dt>Géométries</dt><dd>{dataset.bundle.status.featureCount}</dd></div>
              </dl>
            )}
            {dataset.stale && dataset.state !== 'checking' && dataset.state !== 'updating' && <p className="briefing-warning">Contrôle SIA trop ancien. Les zones restent affichées, mais leur actualité n’a pas pu être confirmée dans le délai de sécurité.</p>}
            {dataset.error && <p className="briefing-warning">Contrôle serveur impossible: {dataset.error}. La dernière base valide est conservée.</p>}
          </Card>

          <section className="briefing-summary-grid">
            <Card><strong>{routeSupCount}</strong><span>SUP AIP proches de la route</span></Card>
            <Card><strong>{citedSupCount}</strong><span>SUP AIP cités dans le PIB</span></Card>
            <Card className={reviewSupCount ? 'warn' : ''}><strong>{reviewSupCount}</strong><span>Publications avec prudence renforcée</span></Card>
            <Card><strong>{briefing.analysis?.summary.routeRelevantCount ?? 0}</strong><span>NOTAM liés au trajet</span></Card>
          </section>

          <Card>
            <h2>Importer le PIB SOFIA</h2>
            <p>L’analyse reste entièrement locale. Le PDF n’est pas envoyé sur un serveur et aucun OCR automatique n’est utilisé.</p>
            <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => void importPdf(event.target.files?.[0])} />
            <div className="briefing-import-actions">
              <Button variant="primary" disabled={briefing.analyzing || !dataset.bundle} onClick={() => inputRef.current?.click()}>
                {briefing.analyzing ? 'Analyse en cours...' : 'Importer un PDF SOFIA'}
              </Button>
              {briefing.analysis && <Button onClick={() => setTab('notams')}>Ouvrir le dernier briefing</Button>}
            </div>
            <label className="briefing-text-input">
              <span>Ou coller le contenu textuel du PIB</span>
              <textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} placeholder="Collez ici le briefing SOFIA complet..." />
            </label>
            <div className="briefing-import-actions">
              <Button disabled={briefing.analyzing || !dataset.bundle} onClick={() => void analyzeText()}>Analyser le texte</Button>
              <Button variant="ghost" disabled={!text} onClick={() => setText('')}>Effacer</Button>
            </div>
          </Card>

          {briefing.analysis && (
            <Card>
              <div className="briefing-card-heading">
                <div>
                  <span>Dernier briefing</span>
                  <strong>{briefing.analysis.context.departure && briefing.analysis.context.destination
                    ? `${briefing.analysis.context.departure} > ${briefing.analysis.context.destination}`
                    : 'Trajet non détecté'}</strong>
                </div>
                <span className={`briefing-context-pill mode-${briefing.analysis.routeContextMode}`}>
                  {briefing.analysis.routeContextMode === 'matching' ? 'Trajet concordant' : 'Contrôle nécessaire'}
                </span>
              </div>
              <p>{briefing.analysis.summary.totalNotams} NOTAM - import {formatUtc(briefing.analysis.importedAtIso)}</p>
              {briefing.routeChangedSinceAnalysis && (
                <div className="briefing-inline-warning">
                  <span>La route CAP CLAIR a changé depuis l’analyse.</span>
                  <Button disabled={briefing.analyzing} onClick={() => void briefing.reanalyze()}>Réévaluer</Button>
                </div>
              )}
              <Button variant="danger" onClick={() => void briefing.clear()}>Effacer le briefing local</Button>
            </Card>
          )}
        </div>
      )}

      {tab === 'notams' && (
        <div className="briefing-list-layout">
          {!briefing.analysis ? (
            <Card>
              <h2>Aucun PIB importé</h2>
              <p>Importez un PDF SOFIA ou collez son contenu depuis l’onglet Synthèse.</p>
              <Button onClick={() => setTab('summary')}>Aller à l’import</Button>
            </Card>
          ) : (
            <>
              <div className="briefing-list-tools">
                <input value={searchNotam} onChange={(event) => { setSearchNotam(event.target.value); setNotamLimit(PAGE_STEP); }} placeholder="Rechercher un NOTAM, un aérodrome..." />
                <select value={notamFilter} onChange={(event) => { setNotamFilter(event.target.value as NotamFilter); setNotamLimit(PAGE_STEP); }}>
                  <option value="all">Tous les NOTAM</option>
                  <option value="route">Concernant la route</option>
                  <option value="alerts">Alertes et éléments à vérifier</option>
                  <option value="supaip">Citant un SUP AIP</option>
                </select>
              </div>
              <p className="briefing-result-count">{filteredNotams.length} résultat(s). Les cercles Q sont toujours identifiés comme approximatifs.</p>
              <div className="briefing-card-list">
                {filteredNotams.slice(0, notamLimit).map((notam) => (
                  <article key={notam.id} className={`briefing-item-card ${notamPriority(notam) ? 'is-warning' : ''}`}>
                    <div className="briefing-item-title">
                      <div><strong>{notam.id}</strong><span>{notamStatusLabel(notam)}</span></div>
                      <span>{notam.fields.a.join(', ') || 'FIR non interprétée'}</span>
                    </div>
                    <p>{notam.fields.e || 'Texte du champ E non interprété.'}</p>
                    <div className="briefing-item-meta">
                      <span>Pertinence : {routeRelevanceLabel(notam.routeRelevance)}</span>
                      {notam.supAipReferences.length > 0 && <span>SUP AIP: {notam.supAipReferences.map((reference) => reference.id).join(', ')}</span>}
                    </div>
                    <div className="briefing-item-actions">
                      <Button variant="secondary" onClick={() => setSelectedNotamId(notam.id)}>Détails</Button>
                      {briefing.analysis && notamHasMapGeometry(notam, briefing.analysis) && <Button onClick={() => showNotamOnMap(notam)}>Voir sur la carte</Button>}
                    </div>
                  </article>
                ))}
              </div>
              {notamLimit < filteredNotams.length && <Button onClick={() => setNotamLimit((current) => current + PAGE_STEP)}>Afficher la suite</Button>}
            </>
          )}
        </div>
      )}

      {tab === 'supaip' && (
        <div className="briefing-list-layout">
          {!dataset.bundle ? (
            <Card><p>Chargement et validation de la base SUP AIP...</p></Card>
          ) : (
            <>
              <div className="briefing-list-tools single">
                <input value={searchSup} onChange={(event) => { setSearchSup(event.target.value); setSupLimit(PAGE_STEP); }} placeholder="Rechercher un SUP AIP, une zone..." />
              </div>
              <p className="briefing-result-count">{filteredSup.length} publication(s). Le classement privilégie la route et le PIB, sans masquer les autres SUP AIP.</p>
              <div className="briefing-card-list">
                {filteredSup.slice(0, supLimit).map((publication) => (
                  <article key={publication.id} className={`briefing-item-card ${publication.partial || publication.missingVerticalCount ? 'is-warning' : ''}`}>
                    <div className="briefing-item-title">
                      <div><strong>SUP AIP {publication.id}</strong><span>{supAipStatusLabel(publication.visualStatus)}</span></div>
                      <span>{publication.mappedGeometryCount} zone(s) cartographiée(s)</span>
                    </div>
                    <h3>{publication.title}</h3>
                    <div className="briefing-item-meta">
                      {publication.routeRelevant && <span className="emphasis">Pertinent pour la route</span>}
                      {publication.citedByNotam && <span className="emphasis">Cité dans le PIB</span>}
                      <span>{formatDistance(publication.routeDistanceNm)}</span>
                    </div>
                    {publication.reason && <p className="briefing-item-warning">{publication.reason}</p>}
                    <div className="briefing-item-actions">
                      <Button variant="secondary" onClick={() => setSelectedSupAipId(publication.id)}>Détails</Button>
                      {publication.features.length > 0 && <Button onClick={() => showSupOnMap(publication)}>Voir sur la carte</Button>}
                      <Button variant="ghost" onClick={() => void openPdf(publication.sourcePdf)}>PDF SIA</Button>
                    </div>
                  </article>
                ))}
              </div>
              {supLimit < filteredSup.length && <Button onClick={() => setSupLimit((current) => current + PAGE_STEP)}>Afficher la suite</Button>}
            </>
          )}
        </div>
      )}

      {tab === 'map' && dataset.bundle && (
        <div className="briefing-map-layout">
          <div className="briefing-map-selection">
            {selectedSup && <span>SUP AIP {selectedSup.id} - {selectedSup.title}</span>}
            {selectedNotam && <span>{selectedNotam.id} - {notamStatusLabel(selectedNotam)}</span>}
            {!selectedSup && !selectedNotam && <span>Toutes les SUP AIP restent visibles. Sélectionnez une zone ou un NOTAM pour la centrer.</span>}
            {(selectedSup || selectedNotam) && <Button variant="ghost" onClick={() => { setSelectedSupAipId(null); setSelectedNotamId(null); }}>Effacer la sélection</Button>}
          </div>
          <BriefingMap
            route={route}
            bundle={dataset.bundle}
            briefing={briefing.analysis}
            selectedSupAipId={selectedSupAipId}
            selectedNotamId={selectedNotamId}
            onSelectSupAip={(id) => { setSelectedSupAipId(id); setSelectedNotamId(null); }}
            onSelectNotam={(id) => { setSelectedNotamId(id); setSelectedSupAipId(null); }}
          />
        </div>
      )}

      <Modal open={selectedSup !== null && tab !== 'map'} title={selectedSup ? `SUP AIP ${selectedSup.id}` : 'SUP AIP'} onClose={() => setSelectedSupAipId(null)}>
        {selectedSup && (
          <div className="briefing-detail">
            <h3>{selectedSup.title}</h3>
            <dl>
              <div><dt>Statut</dt><dd>{supAipStatusLabel(selectedSup.visualStatus)}</dd></div>
              <div><dt>Validité</dt><dd>{selectedSup.validFrom && selectedSup.validTo ? formatSupAipDateRange(selectedSup.validFrom, selectedSup.validTo) : 'Dates à vérifier dans le PDF officiel'}</dd></div>
              <div><dt>Route</dt><dd>{formatDistance(selectedSup.routeDistanceNm)}</dd></div>
              <div><dt>Cartographie</dt><dd>{selectedSup.mappedGeometryCount}/{selectedSup.expectedGeometryCount ?? selectedSup.mappedGeometryCount} géométrie(s)</dd></div>
            </dl>
            {selectedSup.features.length > 0 ? (
              <div className="briefing-zone-list">
                {selectedSup.features.map((feature) => (
                  <div key={feature.properties.id}>
                    <strong>{feature.properties.name}</strong>
                    {feature.properties.verticalLimitsExtracted === false ? (
                      <p className="briefing-item-warning">{SUP_AIP_VERTICAL_NOTICE}</p>
                    ) : (
                      <p>Plancher: {feature.properties.lowerLimit} - Plafond: {feature.properties.upperLimit}</p>
                    )}
                    {feature.properties.activationText && <small>{feature.properties.activationText}</small>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="briefing-item-warning">Publication non cartographiée. Consulter obligatoirement le PDF officiel.</p>
            )}
            {selectedSup.reason && <p className="briefing-item-warning">{selectedSup.reason}</p>}
            <div className="briefing-item-actions">
              {selectedSup.features.length > 0 && <Button onClick={() => showSupOnMap(selectedSup)}>Voir sur la carte</Button>}
              <Button variant="primary" onClick={() => void openPdf(selectedSup.sourcePdf)}>Ouvrir le PDF officiel SIA</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={selectedNotam !== null && tab !== 'map'} title={selectedNotam?.id ?? 'NOTAM'} onClose={() => setSelectedNotamId(null)}>
        {selectedNotam && briefing.analysis && (
          <div className="briefing-detail">
            <dl>
              <div><dt>Validité</dt><dd>{formatUtc(selectedNotam.fields.validFromIso)} - {selectedNotam.fields.validToPermanent ? 'PERM' : formatUtc(selectedNotam.fields.validToIso)}</dd></div>
              <div><dt>Temporalité</dt><dd>{selectedNotam.temporalExplanation}</dd></div>
              <div><dt>Aérodrome/FIR</dt><dd>{selectedNotam.fields.a.join(', ') || 'Non interprété'}</dd></div>
              <div><dt>Limites Q</dt><dd>{selectedNotam.fields.q ? `FL${String(selectedNotam.fields.q.lowerFl ?? 0).padStart(3, '0')} / FL${String(selectedNotam.fields.q.upperFl ?? 999).padStart(3, '0')}` : 'Non interprétées'}</dd></div>
              <div><dt>Géométrie</dt><dd>{selectedNotam.exactPolygon ? 'Polygone précis extrait du champ E' : selectedNotam.eCoordinates.length ? 'Position précise du champ E' : selectedNotam.fields.q?.center ? 'Cercle Q approximatif' : 'Aucune géométrie'}</dd></div>
            </dl>
            {selectedNotam.warnings.map((warning) => <p key={warning} className="briefing-item-warning">{warning}</p>)}
            {selectedNotam.supAipReferences.map((reference) => {
              const reconciliation = briefing.analysis?.reconciliations.find((item) => item.reference.id === reference.id);
              return (
                <div key={reference.id} className="briefing-related-sup">
                  <strong>SUP AIP {reference.id}</strong>
                  <span>{reconciliation?.title ?? 'Publication citée dans le NOTAM'}</span>
                  {reconciliation?.warning && <p>{reconciliation.warning}</p>}
                  {reconciliation?.sourcePdf && <Button variant="ghost" onClick={() => void openPdf(reconciliation.sourcePdf!)}>PDF officiel</Button>}
                </div>
              );
            })}
            <h3>Texte brut original</h3>
            <pre>{selectedNotam.rawText}</pre>
            {notamHasMapGeometry(selectedNotam, briefing.analysis) && <Button onClick={() => showNotamOnMap(selectedNotam)}>Voir sur la carte</Button>}
          </div>
        )}
      </Modal>
    </Page>
  );
}
