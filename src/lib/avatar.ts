const AVATAR_URL = 'https://github.com/1i9htning.png?size=64';

let cached: string | null = null;

export async function getAvatarSrc(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const response = await fetch(AVATAR_URL);
    if (response.ok) {
      const type = response.headers.get('content-type') ?? 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 0) {
        cached = `data:${type};base64,${buffer.toString('base64')}`;
        return cached;
      }
    }
  } catch {
    cached = null;
  }
  return '/avatar.svg';
}
