let pendingUrl: string | null = null;

export function setPendingImport(url: string) {
  pendingUrl = url;
}

export function consumePendingImport(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}
