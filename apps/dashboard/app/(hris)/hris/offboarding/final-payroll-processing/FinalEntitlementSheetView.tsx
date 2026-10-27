'use client';

import { Download, Printer } from 'lucide-react';
import {
  entitlementSheetFromSettlement,
  formatEntitlementDate,
  formatEntitlementHeaderMoney,
  formatEntitlementMoney,
  formatEntitlementStaffName,
} from '@/lib/final-entitlement-sheet';
import { downloadFinalEntitlementSheet } from '@/lib/final-entitlement-sheet-export';
import type { FinalPayrollSettlement } from '@/lib/final-payroll-settlement-shared';
import styles from '@/styles/final-payroll-processing.module.css';

export default function FinalEntitlementSheetView({
  settlement,
}: {
  settlement: FinalPayrollSettlement;
}) {
  const sheet = entitlementSheetFromSettlement(settlement);
  const officialAllowanceCount = 3;
  const officialDeductionCount = 5;
  const coreRows = Math.max(officialAllowanceCount, officialDeductionCount);
  const extraAllowances = sheet.allowances.slice(officialAllowanceCount);
  const extraDeductions = sheet.deductions.slice(officialDeductionCount);

  return (
    <div className={styles.entitlementWrap}>
      <div className={styles.entitlementToolbar}>
        <div>
          <h3>DLE Final Entitlement Sheet</h3>
          <p>Official exit settlement — allowances against recoveries, then netting off.</p>
        </div>
        <div className={styles.entitlementActions}>
          <button type="button" onClick={() => downloadFinalEntitlementSheet(sheet)}>
            <Download /> Export Excel
          </button>
          <button type="button" onClick={() => window.print()}>
            <Printer /> Print
          </button>
        </div>
      </div>

      <div className={styles.entitlementSheet} id="dle-final-entitlement-sheet">
        <div className={styles.entitlementHead}>
          <div className={styles.entitlementBrand}>
            <img src="/brand/dorman-long-logo.svg" alt="Dorman Long Engineering Limited" />
          </div>
          <strong>{sheet.title}</strong>
        </div>

        <table>
          <tbody>
            <tr>
              <th colSpan={2}>STAFF NAME</th>
              <td colSpan={3}>{formatEntitlementStaffName(sheet.employeeName, sheet.employeeCode)}</td>
            </tr>
            <tr>
              <th colSpan={2}>DESIGNATION</th>
              <td colSpan={3}>{sheet.designation || '—'}</td>
            </tr>
            <tr>
              <th colSpan={2}>DEPARTMENT</th>
              <td colSpan={3}>{sheet.department || '—'}</td>
            </tr>
            <tr>
              <th colSpan={2}>DATE OF EMPLOYMENT</th>
              <td colSpan={3}>{formatEntitlementDate(sheet.dateOfEmployment)}</td>
            </tr>
            <tr>
              <th colSpan={2}>DATE OF EXIT</th>
              <td colSpan={3}>{formatEntitlementDate(sheet.dateOfExit)}</td>
            </tr>
            <tr>
              <th colSpan={2}>No of days worked in the year</th>
              <td className={styles.entitlementNum}>{sheet.daysWorkedInYear || '-'}</td>
              <th>Total Working Days</th>
              <td className={styles.entitlementNum}>{sheet.totalWorkingDays}</td>
            </tr>
            <tr>
              <th colSpan={2}>{sheet.leaveYear} Leave Allowance</th>
              <td className={styles.entitlementNum}>{formatEntitlementHeaderMoney(sheet.annualLeaveAllowance)}</td>
              <td colSpan={2} />
            </tr>
            <tr className={styles.entitlementSection}>
              <td colSpan={5}>A &nbsp; EMPLOYER COLUMN</td>
            </tr>
            <tr className={styles.entitlementSection}>
              <td>S/N</td>
              <td>ALLOWANCES</td>
              <td>ENTITLED ALLOWANCE (Monthly Salary)</td>
              <td>DEDUCTION</td>
              <td>DEDUCTION AMOUNT</td>
            </tr>
            {Array.from({ length: coreRows }).map((_, index) => {
              const allowance = index < officialAllowanceCount ? sheet.allowances[index] : undefined;
              const deduction = index < officialDeductionCount ? sheet.deductions[index] : undefined;
              return (
                <tr
                  key={allowance?.id || deduction?.id || `core-${index}`}
                  className={index === 1 ? styles.entitlementHighlight : undefined}
                >
                  <td>{allowance ? index + 1 : ''}</td>
                  <td>{allowance?.label || ''}</td>
                  <td className={styles.entitlementNum}>{allowance ? formatEntitlementMoney(allowance.amount) : ''}</td>
                  <td>{deduction?.label || ''}</td>
                  <td className={styles.entitlementNum}>{deduction ? formatEntitlementMoney(deduction.amount) : ''}</td>
                </tr>
              );
            })}
            {extraAllowances.map((row, index) => (
              <tr key={row.id}>
                <td>{officialAllowanceCount + index + 1}</td>
                <td>{row.label}</td>
                <td className={styles.entitlementNum}>{formatEntitlementMoney(row.amount)}</td>
                <td />
                <td />
              </tr>
            ))}
            {extraDeductions.map((row) => (
              <tr key={row.id}>
                <td colSpan={3} />
                <td>{row.label}</td>
                <td className={styles.entitlementNum}>{formatEntitlementMoney(row.amount)}</td>
              </tr>
            ))}
            <tr className={styles.entitlementTotal}>
              <td colSpan={2}>AMOUNT DUE TO EMPLOYEE</td>
              <td className={styles.entitlementNum}>{formatEntitlementMoney(sheet.amountDueToEmployee)}</td>
              <td>AMOUNT DUE TO DLE</td>
              <td className={styles.entitlementNum}>{formatEntitlementMoney(sheet.amountDueToDle)}</td>
            </tr>
            <tr className={styles.entitlementSection}>
              <td colSpan={5}>B &nbsp; NETTING OFF</td>
            </tr>
            <tr className={styles.entitlementNet}>
              <td colSpan={2}>AMOUNT DUE TO EMPLOYEE</td>
              <td className={styles.entitlementNum}>{formatEntitlementMoney(sheet.netDueToEmployee)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <th colSpan={2}>PREPARED BY:</th>
              <td>{sheet.preparedBy || '—'}</td>
              <th>APPROVED BY:</th>
              <td>{sheet.approvedBy || ''}</td>
            </tr>
            <tr>
              <th colSpan={2}>DATE</th>
              <td>{formatEntitlementDate(sheet.preparedDate)}</td>
              <th>DATE</th>
              <td>{sheet.approvedDate ? formatEntitlementDate(sheet.approvedDate) : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
