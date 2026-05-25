'use client';

import { motion } from 'motion/react';
import { Sparkles, TrendingUp, AlertTriangle, X } from 'lucide-react';

export function RightPanel() {
  return (
    <motion.aside 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full sticky top-6"
    >
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-dle-purple/5 to-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-dle-purple" />
          <h2 className="text-sm font-semibold text-slate-900">AI Intelligence</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Generative Insights */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Live Copilot Insights</h3>
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-dle-purple/20 bg-dle-purple/5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-dle-purple rounded-l-xl"></div>
              <h4 className="text-sm font-medium text-slate-900 mb-1">Workforce Shortage Predicted</h4>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Fabrication yard B is predicting a 15% staffing deficit next week based on current absentee trends and incoming project load.
              </p>
              <button className="text-xs font-medium text-dle-purple flex items-center gap-1 hover:text-dle-purple/80 transition-colors">
                Generate Staffing Action Plan &rarr;
              </button>
            </div>

            <div className="p-4 rounded-xl border border-dle-yellow/20 bg-dle-yellow/5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-dle-yellow rounded-l-xl"></div>
              <h4 className="text-sm font-medium text-slate-900 mb-1">Approaching Overtime Limits</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                12 welding crew members are within 4 hours of strict monthly overtime limits. Risk of compliance breach.
              </p>
            </div>
          </div>
        </div>

        {/* Predictive Heatmap proxy */}
        <div>
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Fatigue Risk Index</h3>
           <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
             <div className="flex justify-between items-end mb-2">
               <span className="text-3xl font-light tracking-tighter text-slate-900">4.2<span className="text-lg text-slate-500">/10</span></span>
               <span className="flex items-center gap-1 text-sm text-dle-green font-medium">
                 <TrendingUp className="w-4 h-4" /> -12%
               </span>
             </div>
             <p className="text-xs text-slate-500 mb-4">Overall fleet fatigue risk is trending down.</p>
             <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                <div className="h-full bg-dle-green w-3/5"></div>
                <div className="h-full bg-dle-yellow w-1/5"></div>
                <div className="h-full bg-dle-red w-[5%]"></div>
             </div>
           </div>
        </div>

      </div>
    </motion.aside>
  );
}
