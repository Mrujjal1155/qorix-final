/** The external shop does not serve Lovable's asset path; use its verified asset host. */
const PREMIUM_ASSET_ORIGIN = "https://friendly-flutter-works.lovable.app";

export function premiumAssetUrl(url: string): string {
  return url.startsWith("/__l5e/assets-v1/") ? `${PREMIUM_ASSET_ORIGIN}${url}` : url;
}