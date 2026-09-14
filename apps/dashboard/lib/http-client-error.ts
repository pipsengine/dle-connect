export function isHtmlOrGatewayErrorBody(body: string | undefined) {
  const text = String(body || '');
  return /<!DOCTYPE|xhtml|<\s*html[\s>]|<\s*head[\s>]|text\/html|Unexpected token ['"]<|is not valid JSON/i.test(text);
}

export function humanizeHttpErrorBody(
  body: string | undefined,
  status = 0,
  product = 'This page',
) {
  const text = String(body || '').trim();
  if (isHtmlOrGatewayErrorBody(text) || status === 502 || status === 504) {
    return `${product} could not load data from the server. Refresh the page. If this continues, the application service may still be starting.`;
  }
  if (status === 503 && (!text || isHtmlOrGatewayErrorBody(text))) {
    return `${product} is temporarily unavailable. Refresh the page and try again.`;
  }
  return text || `${product} failed (${status || 'unknown'}).`;
}
