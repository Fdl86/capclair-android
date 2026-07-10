import { useEffect } from 'react';
import type { BranchZoneBlock, BranchZoneProfile } from '../../domain/airspace.types';
import type { NavRoute } from '../../domain/navigation.types';
import type { TerrainSample } from '../../services/navigation/terrainService';
import type { ProfilePoint } from '../../services/navigation/verticalProfileService';
import { classifyBlock, isRegulatedZone } from '../../services/airspace/zoneRelevance';

interface ZoneCompleteRouteBannerProps {
  route: NavRoute;
  profiles: Record<string, BranchZoneProfile>;
  terrain?: TerrainSample[];
  profile?: ProfilePoint[];
  onVisibleCountChange?: (count: number) => void;
}

interface GlobalZoneBlock extends BranchZoneBlock {
  globalStart: number;
  globalEnd: number;
  branchId: string;
}

interface RouteMarker {
  code: string;
  distanceNm: number;
  ratio: number;
}

function pointName(route: NavRoute, id: string) {
  const point = route.points.find((item) => item.id === id);
  return point?.code ?? point?.nom ?? id.toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function plannedAltitude(route: NavRoute) {
  const altitudes = route.branches.map((branch) => branch.altitudeFt);
  if (!altitudes.length) return route.profile.defaultAltitudeFt;
  const first = altitudes[0];
  return altitudes.every((altitude) => altitude === first) ? first : route.profile.defaultAltitudeFt;
}

function blockRelevance(block: GlobalZoneBlock, altitude: number): number {
  if (block.containsPlannedAltitude) return 1000 + block.priority;
  if (block.altitudeRelation === 'uncertain') return 850 + block.priority;
  if (block.altitudeRelation === 'above' && block.ceilingFt >= altitude - 4500) return 450 + block.priority;
  if (block.altitudeRelation === 'below' && block.floorFt <= altitude + 1500) return 300 + block.priority;
  return -1000;
}

function isUsefulBlock(block: GlobalZoneBlock, altitude: number): boolean {
  return blockRelevance(block, altitude) > 0;
}

function buildRouteMarkers(route: NavRoute): RouteMarker[] {
  let distance = 0;
  const total = Math.max(1, route.distanceTotale);
  const markers: RouteMarker[] = [];

  if (route.points[0]) {
    markers.push({ code: pointName(route, route.points[0].id), distanceNm: 0, ratio: 0 });
  }

  route.branches.forEach((branch) => {
    distance += branch.distanceNm;
    markers.push({ code: pointName(route, branch.to), distanceNm: Number(distance.toFixed(1)), ratio: clamp(distance / total, 0, 1) });
  });

  return markers;
}

function buildGlobalBlocks(route: NavRoute, profiles: Record<string, BranchZoneProfile>): GlobalZoneBlock[] {
  const total = Math.max(1, route.distanceTotale);
  let cumulative = 0;
  const blocks: GlobalZoneBlock[] = [];

  for (const branch of route.branches) {
    const profile = profiles[branch.id];
    if (profile) {
      const branchStart = cumulative;
      const branchDistance = branch.distanceNm;
      for (const block of profile.blocks) {
        blocks.push({
          ...block,
          branchId: branch.id,
          globalStart: clamp((branchStart + block.startRatio * branchDistance) / total, 0, 1),
          globalEnd: clamp((branchStart + block.endRatio * branchDistance) / total, 0, 1)
        });
      }
    }
    cumulative += branch.distanceNm;
  }

  const altitude = plannedAltitude(route);

  return blocks
    .filter((block) => block.globalEnd > block.globalStart)
    .filter((block) => isUsefulBlock(block, altitude))
    .sort((a, b) => blockRelevance(b, altitude) - blockRelevance(a, altitude) || a.floorFt - b.floorFt)
    .slice(0, 32);
}

function scaleBounds(route: NavRoute, terrain: TerrainSample[], profile: ProfilePoint[]) {
  // L'échelle suit l'enveloppe du vol (profil + relief), plus une marge.
  // On ne laisse plus les plafonds de TMA (FL115...) écraser le terrain :
  // les zones plus hautes que la vue seront coupées en haut avec un repère.
  const cruiseMax = profile.length
    ? Math.max(...profile.map((point) => point.altitudeFt))
    : Math.max(route.profile.defaultAltitudeFt, ...route.branches.map((branch) => branch.altitudeFt));
  const terrainMax = terrain.length ? Math.max(...terrain.map((sample) => sample.elevationFt)) : 0;
  const top = Math.max(cruiseMax, terrainMax);
  return { min: 0, max: Math.min(Math.max(top + 1500, 4500), 14000) };
}

// Tracé du profil vertical (ligne ouverte) dans le repère SVG 0..100.
function profilePolylinePoints(profile: ProfilePoint[], min: number, max: number): string {
  if (profile.length < 2) return '';
  const span = max - min || 1;
  return profile
    .map((point) => {
      const x = clamp(point.distanceRatio * 100, 0, 100);
      const y = clamp(100 - ((point.altitudeFt - min) / span) * 100, 0, 100);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// Polygone fermé pour le profil terrain, dans le repère SVG 0..100 (preserveAspectRatio="none").
function terrainPolygonPoints(terrain: TerrainSample[], min: number, max: number): string {
  if (terrain.length < 2) return '';
  const span = max - min || 1;
  const points = terrain.map((sample) => {
    const x = clamp(sample.distanceRatio * 100, 0, 100);
    const y = clamp(100 - ((sample.elevationFt - min) / span) * 100, 0, 100);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `0,100 ${points.join(' ')} 100,100`;
}

function blockStyle(block: GlobalZoneBlock, min: number, max: number) {
  const top = 100 - ((Math.min(block.ceilingFt, max) - min) / (max - min)) * 100;
  const bottom = ((Math.max(block.floorFt, min) - min) / (max - min)) * 100;
  const left = block.globalStart * 100;
  const width = Math.max(3, (block.globalEnd - block.globalStart) * 100);

  return {
    left: `${clamp(left, 0, 98)}%`,
    width: `${clamp(width, 3, 100 - left)}%`,
    top: `${clamp(top, 2, 96)}%`,
    bottom: `${clamp(bottom, 2, 96)}%`
  };
}

function altitudeStyle(altitudeFt: number, min: number, max: number) {
  const y = 100 - ((altitudeFt - min) / (max - min)) * 100;
  return { top: `${clamp(y, 2, 98)}%` };
}

function axisLevels(min: number, max: number) {
  return [max, max * 0.75, max * 0.5, max * 0.25, min].map((value) => Math.round(value));
}

function altitudeLabel(value: number) {
  return value <= 0 ? 'SFC' : `${value} ft`;
}

function isCloseAltitude(a: number, b: number) {
  return Math.abs(a - b) < 120;
}

function blockLabel(block: BranchZoneBlock) {
  const classLabel = block.classCode ? ` ${block.classCode}` : '';
  return `${block.zoneType} ${block.zoneName}${classLabel}`;
}

function contactLabel(block?: BranchZoneBlock) {
  if (!block?.contact?.frequency) return 'À confirmer';
  return `${block.contact.callsign} ${block.contact.frequency}`;
}

function bestActiveBlocks(profiles: Record<string, BranchZoneProfile>) {
  const active = Object.values(profiles).flatMap((profile) => profile.activeBlocks);
  const sorted = active.sort((a, b) => b.priority - a.priority);
  const primary = sorted[0];
  const secondary = sorted.find((block) => block.zoneId !== primary?.zoneId);
  return { primary, secondary };
}

function markerStyle(marker: RouteMarker) {
  return { left: `${clamp(marker.ratio * 100, 0, 100)}%` };
}

export function ZoneCompleteRouteBanner({ route, profiles, terrain = [], profile = [], onVisibleCountChange }: ZoneCompleteRouteBannerProps) {
  const blocks = buildGlobalBlocks(route, profiles);
  const bounds = scaleBounds(route, terrain, profile);
  const altitude = plannedAltitude(route);
  const markers = buildRouteMarkers(route);
  const contacts = bestActiveBlocks(profiles);
  const terrainPoints = terrainPolygonPoints(terrain, bounds.min, bounds.max);
  const profilePoints = profilePolylinePoints(profile, bounds.min, bounds.max);

  // Profil effectif pour la classification (repli plat si pas de perf avion).
  const effectiveProfile: ProfilePoint[] =
    profile.length >= 2
      ? profile
      : [
          { distanceRatio: 0, altitudeFt: altitude },
          { distanceRatio: 1, altitudeFt: altitude }
        ];

  const annotatedBlocks = blocks
    .filter((block) => block.ceilingFt > bounds.min && block.floorFt < bounds.max)
    .map((block) => ({ block, relevance: classifyBlock(block, effectiveProfile, terrain) }))
    .filter(({ block, relevance }) => {
      if (relevance.penetrated) return true;
      if (isRegulatedZone(block.zoneType)) return true; // R/P/D : toujours visibles (sécurité)
      return false; // tout le reste non pénétré est masqué
    })
    .sort((a, b) => a.block.floorFt - b.block.floorFt || b.block.priority - a.block.priority);

  const visibleCount = annotatedBlocks.length;
  useEffect(() => {
    onVisibleCountChange?.(visibleCount);
  }, [onVisibleCountChange, visibleCount]);

  const profileLineY = (alt: number) => clamp(100 - ((alt - bounds.min) / (bounds.max - bounds.min || 1)) * 100, 0, 100);
  const entryMarkers = annotatedBlocks
    .filter(({ relevance }) => relevance.penetrated)
    .map(({ block }) => {
      const ratio = clamp(Math.min(block.globalStart, block.globalEnd), 0, 1);
      const alt = effectiveProfile.length
        ? effectiveProfile.reduce((closest, point) =>
            Math.abs(point.distanceRatio - ratio) < Math.abs(closest.distanceRatio - ratio) ? point : closest
          ).altitudeFt
        : altitude;
      return { id: block.id, x: ratio * 100, y: profileLineY(alt) };
    });

  return (
    <div className="complete-zone-frieze">
      <div className="complete-zone-frieze-head">
        <div>
          <span>Frise zones</span>
          <strong>Navigation complète</strong>
        </div>
        <div>
          <span>Distance</span>
          <strong>{route.distanceTotale.toFixed(1)} NM</strong>
        </div>
      </div>

      <div className="complete-zone-frieze-body">
        <div className="complete-zone-axis">
          {axisLevels(bounds.min, bounds.max)
            .filter((level) => !isCloseAltitude(level, altitude))
            .map((level) => (
              <span key={level} className="axis-label" style={altitudeStyle(level, bounds.min, bounds.max)}>
                {altitudeLabel(level)}
              </span>
            ))}
          <strong className="axis-label planned-axis-label" style={altitudeStyle(altitude, bounds.min, bounds.max)}>
            {altitude} ft
          </strong>
        </div>

        <div className="complete-zone-canvas">
          {terrainPoints && (
            <svg className="complete-zone-terrain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polygon points={terrainPoints} />
            </svg>
          )}
          {profilePoints ? (
            <svg className="complete-zone-profile" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={profilePoints} />
            </svg>
          ) : (
            <div className="complete-zone-altitude-line" style={altitudeStyle(altitude, bounds.min, bounds.max)} />
          )}

          {annotatedBlocks.map(({ block, relevance }, index) => (
            <div
              key={`${block.id}:${index}`}
              className={`complete-zone-block ${block.zoneType.toLowerCase()} ${block.status} ${relevance.penetrated ? 'penetrated' : 'ghost'}${block.ceilingFt > bounds.max ? ' clipped' : ''}`}
              style={blockStyle(block, bounds.min, bounds.max)}
              title={`${blockLabel(block)} - ${block.floorLabel} / ${block.ceilingLabel}`}
            >
              <b>{block.zoneType} {block.zoneName}</b>
              <small>{block.floorLabel} - {block.ceilingLabel}</small>
              <em>{block.contact?.frequency ?? 'À confirmer'}</em>
              {block.ceilingFt > bounds.max && <span className="complete-zone-clip-up">↑ {block.ceilingLabel}</span>}
            </div>
          ))}

          {entryMarkers.map((marker) => (
            <div
              key={marker.id}
              className="complete-zone-entry"
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            />
          ))}

          {markers.map((marker, index) => (
            <div key={`${marker.code}:${index}`} className="complete-zone-marker" style={markerStyle(marker)}>
              <i />
              <b>{marker.code}</b>
              <small>{marker.distanceNm.toFixed(1)} NM</small>
            </div>
          ))}
        </div>
      </div>

      <div className="complete-zone-contact-row">
        <div>
          <span>Contact principal</span>
          <strong>{contacts.primary ? blockLabel(contacts.primary) : 'À confirmer'}</strong>
          <small>{contactLabel(contacts.primary)}</small>
        </div>
        <div>
          <span>Contact secondaire</span>
          <strong>{contacts.secondary ? blockLabel(contacts.secondary) : 'Aucun clair'}</strong>
          <small>{contactLabel(contacts.secondary)}</small>
        </div>
        <div>
          <span>Remarque</span>
          <p>{contacts.primary ? `Zones calculées par position et altitude sur ${route.distanceTotale.toFixed(1)} NM.` : 'Aucune zone principale fiable. Vérifier carte et documentation.'}</p>
        </div>
      </div>

      <div className="complete-zone-legend">
        <span className="inside">Dans la zone</span>
        <span className="below">Sous la zone</span>
        <span className="above">Au-dessus</span>
        <span className="confirm">Doute / à confirmer</span>
      </div>
    </div>
  );
}
