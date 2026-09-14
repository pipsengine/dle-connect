import assert from 'node:assert/strict';
import { humanizeHttpErrorBody, isHtmlOrGatewayErrorBody } from './http-client-error.ts';

const iisPage = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> <head> <meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">';

assert.equal(isHtmlOrGatewayErrorBody(iisPage), true);
assert.equal(isHtmlOrGatewayErrorBody('Payroll employee source is unavailable.'), false);

const humanized = humanizeHttpErrorBody(iisPage.slice(0, 240), 503, 'Payroll Management');
assert.equal(/<!DOCTYPE|<html/i.test(humanized), false, 'must not show IIS HTML in the banner');
assert.match(humanized, /Payroll Management could not load data from the server/);

assert.equal(
  humanizeHttpErrorBody('Timeout connecting to DLE_Enterprise', 503, 'Payroll Management'),
  'Timeout connecting to DLE_Enterprise',
);

console.log('http-client-error.test.ts passed');
