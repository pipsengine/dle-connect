export const formatOrganizationJobTitleLabel = (code: string, title: string) => {
  const normalizedCode = code.trim();
  const normalizedTitle = title.trim();
  if (!normalizedCode) return normalizedTitle;
  if (!normalizedTitle || normalizedTitle.toUpperCase() === normalizedCode.toUpperCase()) return normalizedCode;
  const upperTitle = normalizedTitle.toUpperCase();
  const upperCode = normalizedCode.toUpperCase();
  if (upperTitle.startsWith(`${upperCode} -`) || upperTitle.startsWith(`${upperCode}-`)) return normalizedTitle;
  return `${normalizedCode} - ${normalizedTitle}`;
};

export const displayEmployeeJobTitle = (jobTitle: string, designation: string) => {
  const title = jobTitle === '-' || jobTitle === '—' ? '' : jobTitle;
  const code = designation === '-' || designation === '—' ? '' : designation;
  return formatOrganizationJobTitleLabel(code, title) || title;
};
