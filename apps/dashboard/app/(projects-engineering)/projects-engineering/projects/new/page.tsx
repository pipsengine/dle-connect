import { redirect } from 'next/navigation';

/** Create Project is now a modal on the Projects list. */
export default function NewProjectRedirectPage() {
  redirect('/projects-engineering/projects?action=create');
}
