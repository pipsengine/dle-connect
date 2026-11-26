'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Building2, Shield, Users } from 'lucide-react';
import type { VisitorVisit } from '@/lib/security/visitor-types';
import { todayISO } from '@/lib/security/visitor-views';

const CAPACITY = 300;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEPT_BUCKETS = [
  { name: 'Management', color: 'blue', match: /management|executive|director/i, icon: 'users' },
  { name: 'Operations', color: 'blue', match: /operation|production|project/i, icon: 'users' },
  { name: 'Commercial', color: 'orange', match: /commercial|business|sales/i, icon: 'users' },
  { name: 'Legal', color: 'slate', match: /legal|compliance/i, icon: 'shield' },
  { name: 'Finance', color: 'green', match: /finance|account/i, icon: 'users' },
] as const;

const dayKey = (value: string | Date) => {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};

const inside = (visit: VisitorVisit) => ['Checked In', 'Pending Reception Check-out', 'Pending Security Check-out'].includes(visit.status);

export function VisitorOverview({ visits, employeeCount }: { visits: VisitorVisit[]; employeeCount: number }) {
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('7D');
  const [hover, setHover] = useState<number | null>(null);
  const today = todayISO();
  const expected = visits.filter((visit) => visit.visitDate.slice(0, 10) === today && !['Draft', 'Cancelled', 'Rejected'].includes(visit.status));
  const insideNow = visits.filter(inside);

  const trend = useMemo(() => {
    const span = period === '90D' ? 90 : period === '30D' ? 30 : 7;
    const start = addDays(today, -(span - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const from = addDays(start, Math.floor((index * span) / 7));
      const to = addDays(start, Math.floor(((index + 1) * span) / 7) - 1);
      const count = visits.filter((visit) => {
        const key = visit.visitDate.slice(0, 10);
        return key >= from && key <= to && visit.status !== 'Draft' && visit.status !== 'Cancelled';
      }).length;
      const point = new Date(`${to}T12:00:00`);
      return {
        count,
        label: period === '7D' ? WEEKDAYS[point.getDay()] : `${point.getDate()} ${MONTHS[point.getMonth()]}`,
        sub: period === '7D' ? `${MONTHS[point.getMonth()]} ${point.getDate()}` : '',
      };
    });
  }, [period, today, visits]);

  const yMax = Math.max(4, ...trend.map((point) => point.count));
  const points = trend.map((point, index) => ({
    x: 24 + index * 88,
    y: 188 - (point.count / yMax) * 170,
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = points.length ? `${line} L ${points[6].x} 190 L ${points[0].x} 190 Z` : '';
  const activePoint = hover ?? trend.length - 1;
  const departments = useMemo(() => {
    const counts = DEPT_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }));
    let other = 0;
    expected.forEach((visit) => {
      const bucket = counts.find((item) => item.match.test(visit.department || ''));
      if (bucket) bucket.count += 1;
      else other += 1;
    });
    return [
      ...counts.map(({ name, color, icon, count }) => ({ name, color, icon, count })),
      { name: 'Other Departments', color: 'purple', icon: 'users' as const, count: other },
    ];
  }, [expected]);
  const occupancy = Math.round((insideNow.length / CAPACITY) * 100);
  const available = Math.max(0, CAPACITY - insideNow.length);
  const bars = trend.map((point) => Math.max(4, point.count * 8));

  return (
    <section className="vms-overview-grid">
      <article className="vms-panel vms-trend-panel">
        <div className="vms-chart-head">
          <h2><BarChart3 /> Visitor Trend</h2>
          <div className="vms-segment">
            {(['7D', '30D', '90D'] as const).map((item) => (
              <button key={item} type="button" className={item === period ? 'selected' : ''} onClick={() => setPeriod(item)}>{item}</button>
            ))}
          </div>
        </div>
        <div className="vms-trend-wrap">
          <div className="vms-y-axis">
            {[yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0].map((tick) => <span key={tick}>{tick}</span>)}
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            <svg className="vms-trend-svg" viewBox="0 0 580 215" role="img" aria-label="Visitor trend chart">
              {[18, 60, 102, 144, 186].map((y) => <line key={y} x1="24" x2="552" y1={y} y2={y} className="vms-gridline" />)}
              <path d={area} className="vms-chart-area" />
              <path d={line} className="vms-chart-line" />
              {points.map((point, index) => (
                <circle key={trend[index].label} cx={point.x} cy={point.y} r="5" className="vms-chart-point" onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />
              ))}
            </svg>
            {activePoint >= 0 && points[activePoint] ? (
              <div className="vms-tooltip" style={{ left: `${(points[activePoint].x / 580) * 100}%`, top: `${(points[activePoint].y / 215) * 100}%` }}>
                <b>{trend[activePoint].label}{trend[activePoint].sub ? `, ${trend[activePoint].sub}` : ''}</b>
                <span>{trend[activePoint].count} Visitor{trend[activePoint].count === 1 ? '' : 's'}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="vms-x-axis">
          {trend.map((point) => <div key={`${point.label}-${point.sub}`}><b>{point.label}</b><span>{point.sub}</span></div>)}
        </div>
      </article>

      <article className="vms-panel vms-occupancy-panel">
        <div className="vms-panel-heading"><h2><Building2 /> Building Occupancy</h2></div>
        <div className="vms-occupancy-main">
          <div className="vms-donut" style={{ background: `conic-gradient(#0ab995 0 ${occupancy}%, #e3eaf3 ${occupancy}% 100%)` }}>
            <div><b>{occupancy}%</b><span>Occupied</span></div>
          </div>
          <div className="vms-occupancy-stats">
            <div>Total Capacity<strong>{CAPACITY}</strong></div>
            <div>Visitors Inside<strong>{insideNow.length}</strong></div>
            <div>Employee Directory<strong>{employeeCount}</strong></div>
            <div>Available<strong className="vms-green-text">{available}</strong></div>
          </div>
        </div>
        <div className="vms-occupancy-label">Occupancy Today</div>
        <div className="vms-mini-bars">{bars.map((height, index) => <i key={trend[index].label} style={{ height: `${Math.min(height, 24)}px` }} />)}</div>
      </article>

      <article className="vms-panel vms-department-panel">
        <div className="vms-panel-heading"><h2><Building2 /> Department Summary</h2></div>
        <div className="vms-department-list">
          {departments.map((department) => (
            <div className="vms-department-row" key={department.name}>
              <span className={`vms-dept-icon ${department.color}`}>{department.icon === 'shield' ? <Shield /> : <Users />}</span>
              <span>{department.name}</span>
              <b>{department.count}</b>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
