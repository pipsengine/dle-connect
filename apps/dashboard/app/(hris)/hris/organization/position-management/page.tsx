import PositionsClient from '../positions/PositionsClient';

export default function PositionManagementPage() {
  return (
    <PositionsClient
      pageTitle="Position Management"
      pageDescription="Manage approved positions, vacancy controls, incumbency, and replacement readiness across the organization."
      breadcrumbLabel="Position Management"
    />
  );
}
