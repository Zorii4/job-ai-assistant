export type AppRoute =
  | { name: 'resumes' }
  | { name: 'analysis' }
  | { name: 'history' }
  | { name: 'account' }
  | { name: 'analysis-result'; applicationCaseId: string; runId: string }
  | { name: 'privacy-policy' }
  | { name: 'not-found' };

const analysisResultPattern = /^\/applications\/([^/]+)\/analysis\/([^/]+)$/;

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === '/' || pathname === '/resumes') {
    return { name: 'resumes' };
  }

  if (pathname === '/analysis' || pathname === '/applications/new') {
    return { name: 'analysis' };
  }

  if (pathname === '/history') {
    return { name: 'history' };
  }

  if (pathname === '/account') {
    return { name: 'account' };
  }

  if (pathname === '/privacy-policy') {
    return { name: 'privacy-policy' };
  }

  const analysisResultMatch = pathname.match(analysisResultPattern);

  if (analysisResultMatch !== null) {
    const applicationCaseId = decodeRouteSegment(analysisResultMatch[1]);
    const runId = decodeRouteSegment(analysisResultMatch[2]);

    if (applicationCaseId === null || runId === null) {
      return { name: 'not-found' };
    }

    return {
      name: 'analysis-result',
      applicationCaseId,
      runId,
    };
  }

  return { name: 'not-found' };
}

export function getAppRoutePath(route: Exclude<AppRoute, { name: 'not-found' }>): string {
  if (route.name === 'resumes') return '/resumes';
  if (route.name === 'analysis') return '/analysis';
  if (route.name === 'history') return '/history';
  if (route.name === 'account') return '/account';
  if (route.name === 'privacy-policy') return '/privacy-policy';

  return `/applications/${encodeURIComponent(route.applicationCaseId)}/analysis/${encodeURIComponent(route.runId)}`;
}

function decodeRouteSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
