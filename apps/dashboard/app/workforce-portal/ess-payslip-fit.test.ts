import assert from 'node:assert/strict';
import { A4_WIDTH_PX, payslipDisplayScale, payslipFitScale, payslipFrameSize } from './ess-payslip-fit.ts';

assert.ok(A4_WIDTH_PX > 790 && A4_WIDTH_PX < 800, 'A4 width is about 794px at 96dpi');

assert.equal(payslipFitScale(0), 1, 'unmeasured host keeps full size until layout');
assert.equal(payslipFitScale(A4_WIDTH_PX), 1);
assert.equal(payslipFitScale(A4_WIDTH_PX + 200), 1, 'never upscale past A4');

const laptopColumn = 520;
const laptopFit = payslipFitScale(laptopColumn);
assert.ok(laptopFit < 1, 'laptop column narrower than A4 must scale down');
assert.ok(Math.abs(laptopFit - laptopColumn / A4_WIDTH_PX) < 1e-9);

const frame = payslipFrameSize(1400, payslipDisplayScale(laptopColumn, 100));
assert.ok(frame.width <= laptopColumn + 0.01, 'scaled sheet width stays inside the host');
assert.ok(frame.height < 1400, 'scaled sheet height must shrink with transform so neighbors do not overlap');

const zoomed = payslipDisplayScale(laptopColumn, 130);
assert.ok(zoomed > laptopFit, 'toolbar zoom still multiplies fit scale');

console.log('ess-payslip-fit.test.ts passed');
