'use client';

import { useEffect, useState } from 'react';

export function ActingEmployee() {
  const [label, setLabel] = useState('Loading signed-in employee…');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!active) return;
        const data = json?.data;
        const name = data?.fullName || data?.username || 'Signed-in user';
        const code = String(data?.employeeCode || '').trim();
        setLabel(code ? `${name} (${code})` : name);
      })
      .catch(() => {
        if (active) setLabel('Signed-in user');
      });
    return () => {
      active = false;
    };
  }, []);

  return <p className="text-[12px] font-semibold text-slate-600">Performed by {label}. This employee is stored with the record.</p>;
}
