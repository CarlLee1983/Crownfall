export interface PinnedModelSource {
  readonly url_or_tool: string;
  readonly commit?: string;
  readonly prompt_or_source_record: string;
}

export function pinnedModelUrl(
  source: PinnedModelSource,
  path = source.prompt_or_source_record,
): string {
  if (source.commit === undefined) throw new Error(`缺少 ${path} 的來源版本`);
  const repository = new URL(source.url_or_tool).pathname;
  return `https://raw.githubusercontent.com${repository}/${source.commit}/${path}`;
}
