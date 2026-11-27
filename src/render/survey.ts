// 取得 #51 的 Google 表單預填網址後，以三個標記取代各欄位的預填值。
export const PLAYTEST_SURVEY_URL_TEMPLATE =
  'https://example.invalid/viewform?usp=pp_url&entry.100={version}&entry.200={result}&entry.300={wave}';

export function createSurveyUrl(
  template: string,
  version: string,
  result: string,
  waveNumber: number,
): string {
  return template
    .replaceAll('{version}', encodeURIComponent(version))
    .replaceAll('{result}', encodeURIComponent(result))
    .replaceAll('{wave}', encodeURIComponent(String(waveNumber)));
}
