import { useEffect, useState } from 'react';

export function useResponsiveMode() {
  const [isLandscape, setIsLandscape] = useState(() => window.matchMedia('(orientation: landscape) and (max-height: 760px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape) and (max-height: 760px)');
    const onChange = () => setIsLandscape(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return { isLandscape };
}
