export const CODEX_REFRESH_TOKEN_REUSED_MESSAGE = [
  'Codex authentication failed: the mounted Codex refresh token was already used.',
  'Re-authenticate Codex on the orchestrator host, then rerun the CodeRabbit agent.',
].join(' ');

function readStringProperty(
  value: unknown,
  propertyName: string,
): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[propertyName];
  return typeof propertyValue === 'string' ? propertyValue : null;
}

export function collectErrorDiagnostics(error: unknown, depth = 0): string[] {
  if (depth > 4) {
    return [];
  }

  if (typeof error === 'string') {
    return [error];
  }

  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const diagnostics = [
    readStringProperty(error, 'name'),
    readStringProperty(error, 'message'),
    readStringProperty(error, 'stack'),
    readStringProperty(error, 'stderr'),
    readStringProperty(error, 'responseBody'),
  ].filter((value): value is string => value !== null);

  const data = (error as Record<string, unknown>)['data'];
  if (typeof data === 'object' && data !== null) {
    diagnostics.push(
      ...[
        readStringProperty(data, 'stderr'),
        readStringProperty(data, 'responseBody'),
        readStringProperty(data, 'promptExcerpt'),
      ].filter((value): value is string => value !== null),
    );
  }

  return [
    ...diagnostics,
    ...collectErrorDiagnostics(
      (error as Record<string, unknown>)['cause'],
      depth + 1,
    ),
  ];
}

export function isCodexRefreshTokenReusedFailure(error: unknown): boolean {
  const diagnosticText = collectErrorDiagnostics(error).join('\n');
  return (
    diagnosticText.includes('refresh_token_reused') ||
    diagnosticText.includes('refresh token has already been used') ||
    diagnosticText.includes('access token could not be refreshed')
  );
}
