/**
 * HR-facing payroll earning/deduction summarization rules:
 * - Junior/Senior/Management basic variants → one "Basic earning"
 * - Meal, overtime, stockcount, union earnings stay separate
 * - Union dues/deductions for unionized staff → "Union Deductions"
 */

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export const isBasicEarningLine = (code: unknown, name: unknown) => {
  const codeText = upper(code);
  const nameText = upper(name);
  const blob = `${codeText} ${nameText}`;
  // Keep non-basic special earnings out of Basic.
  if (/UNION\s*EARN|MEAL|OVERTIME|\bOVT\b|STOCK\s*COUNT|STOCKCOUNT|GRATUITY|WEEKDAY|SATURDAY|SUNDAY|PUBHOL|PUBLIC\s*HOLIDAY/i.test(blob)) {
    return false;
  }
  if (/UNION/i.test(blob) && /DUES|DED/.test(blob)) return false;
  return (
    /(_BASIC|^BASIC$|^BASIC1|BASICSALARY|EXP_BASIC|COLA_BASIC)/i.test(codeText)
    || /^(JUNIOR|SENIOR|MGMT?|MANAGEMENT)?\s*BASIC(\s+(SALARY|EARNING))?$/i.test(nameText)
    || /\bBASIC\s+(SALARY|EARNING)\b/i.test(nameText)
  );
};

export const isUnionDeductionLine = (code: unknown, name: unknown) => {
  const blob = `${upper(code)} ${upper(name)}`;
  if (!/UNION/i.test(blob)) return false;
  // Deduction-side union lines (dues), not union earnings.
  if (/EARN/i.test(blob) && !/DUES|DED/.test(blob)) return false;
  return /UNION|DUES/.test(blob);
};

export const isUnionEarningLine = (code: unknown, name: unknown) => {
  const blob = `${upper(code)} ${upper(name)}`;
  return /UNION/i.test(blob) && /EARN/i.test(blob) && !/DUES|DED/.test(blob);
};

export const summarizePayrollComponentKey = (kind: 'earning' | 'benefit' | 'deduction', code: unknown, name: unknown) => {
  const safeCode = compact(code) || compact(name) || 'UNKNOWN';
  if (kind === 'earning' && isBasicEarningLine(code, name)) {
    return { key: 'earning:BASIC_EARNING', label: 'Basic earning' };
  }
  if (kind === 'earning' && isUnionEarningLine(code, name)) {
    return { key: `earning:${safeCode.toUpperCase()}`, label: compact(name) || 'Union earning' };
  }
  if (kind === 'deduction' && isUnionDeductionLine(code, name)) {
    return { key: 'deduction:UNION_DEDUCTIONS', label: 'Union Deductions' };
  }
  if (kind === 'benefit') {
    return { key: `benefit:${safeCode.toUpperCase()}`, label: `Benefit: ${compact(name) || safeCode}` };
  }
  if (kind === 'deduction') {
    return { key: `deduction:${safeCode.toUpperCase()}`, label: compact(name) || safeCode };
  }
  return { key: `earning:${safeCode.toUpperCase()}`, label: compact(name) || safeCode };
};

export const sumMatchingLines = (
  lines: Array<{ code?: string; name?: string; label?: string; amount?: number | null }> | undefined,
  matcher: (code: string, name: string) => boolean,
) => {
  let total = 0;
  for (const line of lines || []) {
    const code = compact(line.code);
    const name = compact(line.name || line.label);
    if (!matcher(code, name)) continue;
    total += Number(line.amount || 0);
  }
  return Math.round(total * 100) / 100;
};

export const basicEarningAmount = (
  lines: Array<{ code?: string; name?: string; label?: string; amount?: number | null }> | undefined,
) => sumMatchingLines(lines, isBasicEarningLine);

export const unionDeductionAmount = (
  lines: Array<{ code?: string; name?: string; label?: string; amount?: number | null }> | undefined,
) => sumMatchingLines(lines, isUnionDeductionLine);
