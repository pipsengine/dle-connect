'use client';

import { Users, HardHat, ShieldCheck, Activity, Target, AlertTriangle } from 'lucide-react';

const kpis = [
  {
    id: 1,
    title: 'Total Workforce',
    value: '2,450',
    trend: '+5%',
    trendUp: true,
    icon: Users,
    color: 'blue',
    aiInsight: 'Optimal utilization within acceptable threshold.',
  },
  {
    id: 2,
    title: 'Active Deployments',
    value: '1,892',
    trend: '+12%',
    trendUp: true,
    icon: HardHat,
    color: 'cyan',
    aiInsight: '3 projects requiring crew rotation next week.',
  },
  {
    id: 3,
    title: 'HSE Compliance',
    value: '98.5%',
    trend: '-0.2%',
    trendUp: false,
    icon: ShieldCheck,
    color: 'green',
    aiInsight: '14 certifications expiring in 30 days.',
  },
  {
    id: 4,
    title: 'Fatigue Risk Level',
    value: 'Low',
    trend: '-1.5%',
    trendUp: true, // Lower is better here
    icon: Activity,
    color: 'yellow',
    aiInsight: '2 offshore crews show elevated fatigue markers.',
  }
];

export function KPIGrid() {
  const getColorClasses = (color: string) => {
    switch(color) {
      case 'blue': return 'bg-dle-blue/10 text-dle-blue border-dle-blue';
      case 'cyan': return 'bg-dle-cyan/10 text-dle-cyan border-dle-cyan';
      case 'green': return 'bg-dle-green/10 text-dle-green border-dle-green';
      case 'yellow': return 'bg-dle-yellow/10 text-dle-yellow border-dle-yellow';
      default: return 'bg-slate-100 text-slate-500 border-slate-300';
    }
  };

  const getGradientClass = (color: string) => {
    switch(color) {
      case 'blue': return 'from-dle-blue/20 to-transparent';
      case 'cyan': return 'from-dle-cyan/20 to-transparent';
      case 'green': return 'from-dle-green/20 to-transparent';
      case 'yellow': return 'from-dle-yellow/20 to-transparent';
      default: return 'from-slate-100 to-transparent';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpis.map((kpi) => (
        <div 
          key={kpi.id} 
          className="group bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-slate-100 relative overflow-hidden flex flex-col"
        >
          {/* Top colored border */}
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${getGradientClass(kpi.color)}`}></div>
          <div className={`absolute top-0 left-0 w-full h-1 border-t-2 ${getColorClasses(kpi.color).split(' ')[2]} border-opacity-50`}></div>
          
          <div className="p-5 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getColorClasses(kpi.color).split(' ')[0]} ${getColorClasses(kpi.color).split(' ')[1]}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${kpi.trendUp ? 'bg-dle-green/10 text-dle-green' : 'bg-dle-red/10 text-dle-red'}`}>
                {kpi.trendUp ? '↑' : '↓'} {kpi.trend}
              </span>
            </div>
            
            <h3 className="text-slate-500 text-sm font-medium mb-1">{kpi.title}</h3>
            <div className="text-3xl font-light tracking-tight text-slate-900 mb-4">{kpi.value}</div>
            
            {/* AI Insight Badge */}
            <div className="mt-auto pt-4 border-t border-slate-50">
              <div className="flex items-start gap-2 bg-dle-purple/5 p-2 rounded-lg border border-dle-purple/10">
                <Target className="w-3.5 h-3.5 text-dle-purple shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-tight">
                  <span className="font-semibold text-dle-purple">AI Insight:</span> {kpi.aiInsight}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
