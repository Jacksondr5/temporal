export function buildGitHubCredentialEnv(githubToken?: string): NodeJS.ProcessEnv {
  if (!githubToken) {
    return {};
  }

  return {
    GH_TOKEN: githubToken,
    GITHUB_TOKEN: githubToken,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_0:
      '!f() { if test "$1" = get; then echo username=x-access-token; echo password="$GITHUB_TOKEN"; fi; }; f',
  };
}
