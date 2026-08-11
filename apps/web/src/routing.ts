export type AppRoute =
  | { name: 'resumes' }
  | { name: 'new-application' }
  | { name: 'analysis-result'; applicationCaseId: string; runId: string }
  | { name: 'not-found' };

const analysisResultPattern = /^\/applications\/([^/]+)\/analysis\/([^/]+)$/;

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === '/' || pathname === '/resumes') {
    return { name: 'resumes' };
  }

  if (pathname === '/applications/new') {
    return { name: 'new-application' };
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
  if (route.name === 'new-application') return '/applications/new';

  return `/applications/${encodeURIComponent(route.applicationCaseId)}/analysis/${encodeURIComponent(route.runId)}`;
}

function decodeRouteSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
