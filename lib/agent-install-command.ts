const installer = "https://github.com/TinyWarden/tinywarden-agent/releases/latest/download/install.sh";

/** A setup code is unpadded base64url, never arbitrary shell text. */
export function installCommand(setupCode: string): string | null {
  if (setupCode.length > 4096 || /^tw_setup_v1\.[A-Za-z0-9_-]+$/.exec(setupCode)?.[0] !== setupCode) return null;
  return `curl -fLO ${installer} && printf '%s\\n' '${setupCode}' | sudo bash install.sh --setup-code-stdin`;
}
