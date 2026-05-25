'use client';

import { Check, Clock, UserCheck, AlertTriangle } from 'lucide-react';

const workflowSteps = [
  { id: 1, title: 'Requisition Raised', status: 'completed', date: 'Oct 12' },
  { id: 2, title: 'Budget Approved', status: 'completed', date: 'Oct 14' },
  { id: 3, title: 'Vacancy Published', status: 'completed', date: 'Oct 15' },
  { id: 4, title: 'AI Candidate Screening', status: 'active', info: '320 scanned, 45 shortlisted', icon: UserCheck },
  { id: 5, title: 'Technical Interview', status: 'pending' },
  { id: 6, title: 'Offer Approval', status: 'pending' },
  { id: 7, title: 'Deployment Ready', status: 'pending' },
];

export function WorkflowPipeline() {
  return (
    <div className="w-full">
      <div className="relative">
        <div className="absolute top-1/2 left-4 w-[calc(100%-2rem)] h-1 bg-slate-100 -translate-y-1/2 rounded-full overflow-hidden">
          <div className="h-full bg-dle-blue w-[40%] transition-all duration-1000 ease-in-out"></div>
        </div>

        <div className="relative flex justify-between">
          {workflowSteps.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            
            return (
              <div key={step.id} className="flex flex-col items-center group relative w-24">
                <div 
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-white z-10 transition-all duration-300 ${
                    isCompleted 
                      ? 'border-dle-blue text-dle-blue' 
                      : isActive 
                        ? 'border-dle-blue shadow-[0_0_0_4px_rgba(17,160,230,0.15)] text-dle-blue' 
                        : 'border-slate-200 text-slate-300'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : isActive ? (
                    step.icon ? <step.icon className="w-4 h-4" /> : <Clock className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-semibold">{step.id}</span>
                  )}
                </div>
                
                <div className="absolute top-10 mt-2 text-center flex flex-col items-center">
                  <span className={`text-[11px] leading-tight font-medium ${
                    isActive ? 'text-dle-blue font-semibold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}>
                    {step.title}
                  </span>
                  
                  {step.date && (
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">{step.date}</span>
                  )}
                  {isActive && step.info && (
                    <div className="mt-2 bg-dle-purple/10 border border-dle-purple/20 px-2 py-1 rounded text-[10px] text-dle-purple font-medium w-max shadow-sm whitespace-nowrap">
                      {step.info}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-20 flex justify-end">
        <button className="text-xs font-medium text-dle-blue flex items-center gap-1 hover:text-dle-blue-deep transition-colors bg-dle-blue/5 px-3 py-1.5 rounded-md border border-dle-blue/10">
          View Pipeline Details &rarr;
        </button>
      </div>
    </div>
  );
}
