'use client';

import { KPIGrid } from '@/components/dashboard/kpi-grid';
import { SmartTable } from '@/components/dashboard/smart-table';
import { WorkflowPipeline } from '@/components/dashboard/workflow-pipeline';
import { PageTemplate } from '@/components/layout/page-template';
import { FileUp, Users } from 'lucide-react';

export default function ExecutiveHRDashboard() {
  return (
    <PageTemplate
      title="Executive Command Center"
      description="AI-powered dashboard for top-level HR analytics, workforce utilization, and risk indicators."
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard/executive-hr-dashboard' },
        { label: 'Executive HR Dashboard' }
      ]}
      secondaryAction={{ label: 'Export Report', icon: FileUp, onClick: () => console.log('Export') }}
      primaryAction={{ label: 'Deploy Workforce', icon: Users, onClick: () => console.log('Deploy') }}
    >
      <div className="space-y-8">
        <section>
          <KPIGrid />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[500px]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">Active Workforce Deployments</h2>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-dle-blue/10 text-dle-blue text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-dle-blue animate-pulse"></span>
                  Live Sync
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <SmartTable />
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[500px]">
            <div className="px-6 py-5 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">Active Recruitment Workflows</h2>
              <p className="text-sm text-slate-500 mt-1">Predictive tracking of critical engineering roles.</p>
            </div>
            <div className="p-6 flex-1 overflow-auto custom-scrollbar flex items-center justify-center">
              <WorkflowPipeline />
            </div>
          </section>
        </div>
      </div>
    </PageTemplate>
  );
}
