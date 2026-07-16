export const APP_VERSION_BASE = 'CAP CLAIR DEV15.2.13 - BACKGROUND GPS RECOVERY';
export const APP_BUILD_ID = (import.meta.env.VITE_BUILD_ID || 'local').trim().slice(0, 7);
export const APP_VERSION = `${APP_VERSION_BASE} - build ${APP_BUILD_ID}`;
export const APP_TITLE = 'CAP CLAIR';
export const APP_SUBTITLE = 'Navigation VFR';
