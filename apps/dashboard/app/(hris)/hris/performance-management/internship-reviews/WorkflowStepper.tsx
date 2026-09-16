import { Check, Clock, CornerDownLeft, Minus } from 'lucide-react';
import type { InternshipApproval } from '@/lib/internship-performance-review-types';

export default function InternshipWorkflowStepper({ items }: { items: InternshipApproval[] }) {
  return (
    <div className="workflow">
      {items.map((approval, index) => (
        <div className="wf" key={approval.step}>
          <div className={`wfIcon ${approval.status.toLowerCase()}`}>
            {approval.status === 'Approved' ? <Check /> : approval.status === 'Returned' ? <CornerDownLeft /> : approval.status === 'Skipped' ? <Minus /> : <Clock />}
          </div>
          <div>
            <small>STEP {index + 1}</small>
            <b>{approval.step}</b>
            <span>{approval.approver || 'Automatically bypassed'}</span>
            <em>
              {approval.status}
              {approval.at ? ` · ${approval.at}` : ''}
            </em>
          </div>
          {index < items.length - 1 ? <div className="wfLine" /> : null}
        </div>
      ))}
    </div>
  );
}
