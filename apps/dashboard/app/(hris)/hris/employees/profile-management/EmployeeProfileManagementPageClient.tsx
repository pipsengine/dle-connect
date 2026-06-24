'use client';

import { useState } from 'react';
import EmployeeProfileManagementHub, { type ProfileTabId } from './EmployeeProfileManagementHub';

export default function EmployeeProfileManagementPageClient() {
  const [activeTab, setActiveTab] = useState<ProfileTabId>('personal-information');

  return <EmployeeProfileManagementHub activeTab={activeTab} onSelectTab={setActiveTab} />;
}
