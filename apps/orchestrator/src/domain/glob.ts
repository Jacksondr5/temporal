function escapeRegex(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  const doubleStarToken = '__DOUBLE_STAR__';
  const singleStarToken = '__SINGLE_STAR__';
  const normalized = escapeRegex(
    glob
      .replaceAll('**', doubleStarToken)
      .replaceAll('*', singleStarToken),
  )
    .replaceAll(doubleStarToken, '.*')
    .replaceAll(singleStarToken, '[^/]*');
  return new RegExp(`^${normalized}$`);
}

export function fileMatchesGlobs(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(filePath));
}
