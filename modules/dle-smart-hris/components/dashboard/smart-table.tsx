'use client';

import { MoreHorizontal, Filter, Search } from 'lucide-react';
import Image from 'next/image';

const employees = [
  {
    id: 'EMP-0182',
    name: 'Samuel Ojo',
    role: 'Senior Welder',
    photo: 'https://picsum.photos/seed/oj/100/100',
    deployment: 'Active - Bonga FPSO',
    hse: 'Cleared',
    fatigue: 'Low',
    aiStatus: 'Optimal',
    statusColor: 'green'
  },
  {
    id: 'EMP-1192',
    name: 'Michael Ibrahim',
    role: 'Crane Operator',
    photo: 'https://picsum.photos/seed/mi/100/100',
    deployment: 'Pending Relocation',
    hse: 'Valid (Expires 14D)',
    fatigue: 'Moderate',
    aiStatus: 'Monitor',
    statusColor: 'yellow'
  },
  {
    id: 'EMP-0842',
    name: 'David Nwachukwu',
    role: 'Site Supervisor',
    photo: 'https://picsum.photos/seed/dn/100/100',
    deployment: 'Active - Fabrication Yard A',
    hse: 'Cleared',
    fatigue: 'High',
    aiStatus: 'Rest Recommended',
    statusColor: 'red'
  },
  {
    id: 'EMP-1055',
    name: 'Amina Bello',
    role: 'QA/QC Inspector',
    photo: 'https://picsum.photos/seed/ab/100/100',
    deployment: 'Active - Egina',
    hse: 'Cleared',
    fatigue: 'Low',
    aiStatus: 'Optimal',
    statusColor: 'green'
  }
];

export function SmartTable() {
  return (
    <div className="w-full">
      <div className="flex px-6 py-3 border-b border-slate-100 bg-slate-50/50 gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-dle-purple absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="AI Search: 'Show me crane operators with high fatigue risk...'"
            className="w-full pl-9 pr-4 py-2 bg-white border border-dle-purple/20 rounded-md text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-purple/20 focus:border-dle-purple transition-all shadow-sm"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="text-xs text-slate-400 bg-slate-50/50 uppercase font-semibold">
            <tr>
              <th className="px-6 py-4 border-b border-slate-100">Personnel</th>
              <th className="px-6 py-4 border-b border-slate-100">Deployment Status</th>
              <th className="px-6 py-4 border-b border-slate-100">HSE & Certs</th>
              <th className="px-6 py-4 border-b border-slate-100">Fatigue Index</th>
              <th className="px-6 py-4 border-b border-slate-100">AI Recommendation</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 border border-slate-200 relative">
                       <Image src={emp.photo} alt={emp.name} fill referrerPolicy="no-referrer" className="object-cover" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500">{emp.role} • {emp.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    {emp.deployment}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {emp.statusColor === 'yellow' ? (
                    <span className="text-dle-yellow font-medium">{emp.hse}</span>
                  ) : (
                    <span className="text-slate-600">{emp.hse}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {emp.statusColor === 'red' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-dle-red/10 px-2.5 py-0.5 text-xs font-medium text-dle-red border border-dle-red/20">
                      High Risk
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium ${
                      emp.statusColor === 'yellow' ? 'bg-dle-yellow/10 text-dle-yellow border border-dle-yellow/20' : 'bg-dle-green/10 text-dle-green border border-dle-green/20'
                    }`}>
                      {emp.fatigue}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <div className="flex items-center gap-1.5 text-xs font-medium text-dle-purple">
                     <span className="w-1.5 h-1.5 rounded-full bg-dle-purple border border-white shadow-sm shrink-0"></span>
                     {emp.aiStatus}
                   </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button className="text-slate-400 hover:text-dle-blue transition-colors p-1 rounded-md hover:bg-slate-100">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
