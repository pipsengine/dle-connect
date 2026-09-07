import { redirect } from 'next/navigation';

export default function LegacySettingsRedirect() {
  redirect('/projects-engineering/configuration');
}
