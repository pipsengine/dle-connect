const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function exportTimesheet(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = list.length ? Object.keys(list[0]) : ['Employee Code', 'Employee Name'];
  const csv = `\uFEFF${[headers.map(csvCell).join(','), ...list.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'DLE_Timesheet_Booking_Summary.csv';
  link.click();
  URL.revokeObjectURL(url);
}
