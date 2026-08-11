import { redirect } from 'next/navigation';

export const metadata = { title: 'Inventory | Asset Management' };

export default function InventoryPage() {
  redirect('/it-support/asset-management/hardware');
}
