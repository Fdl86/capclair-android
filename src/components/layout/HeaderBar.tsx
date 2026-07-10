import { APP_SUBTITLE, APP_TITLE, APP_VERSION } from '../../app/version';

export function HeaderBar() {
  return (
    <header className="header-bar">
      <div className="brand-block">
        <img src="/cap-clair-logo.svg" alt="" />
        <div>
          <strong>{APP_TITLE}</strong>
          <span>{APP_SUBTITLE}</span>
        </div>
      </div>
      <div className="header-status">
        <span>App ouverte</span>
        <span>Carte aéro</span>
        <span>{APP_VERSION}</span>
      </div>
    </header>
  );
}
