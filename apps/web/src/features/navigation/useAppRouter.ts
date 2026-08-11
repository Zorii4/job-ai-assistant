import { useCallback, useEffect, useState } from 'react';

import { getAppRoutePath, parseAppRoute } from '../../routing';
import type { AppRoute } from '../../routing';

function getCurrentRoute(): AppRoute {
  return parseAppRoute(window.location.pathname);
}

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);

  useEffect(() => {
    const handlePopState = () => setRoute(getCurrentRoute());

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: Exclude<AppRoute, { name: 'not-found' }>) => {
    const path = getAppRoutePath(nextRoute);

    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      setRoute(nextRoute);
    }
  }, []);

  return { route, navigate };
}
