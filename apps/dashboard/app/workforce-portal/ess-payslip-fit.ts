export const A4_WIDTH_PX = 210 * (96 / 25.4);

export function payslipFitScale(availableWidth: number, a4Width = A4_WIDTH_PX) {
  if (availableWidth < 2) return 1;
  return Math.min(1, availableWidth / a4Width);
}

export function payslipDisplayScale(availableWidth: number, zoomPercent: number, a4Width = A4_WIDTH_PX) {
  return payslipFitScale(availableWidth, a4Width) * (zoomPercent / 100);
}

export function payslipFrameSize(naturalHeight: number, displayScale: number, a4Width = A4_WIDTH_PX) {
  return {
    width: a4Width * displayScale,
    height: naturalHeight * displayScale,
  };
}
