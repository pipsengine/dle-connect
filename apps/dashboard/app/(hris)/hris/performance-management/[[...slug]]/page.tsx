import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PerformanceManagementClient from '../PerformanceManagementClient';
import { findPerformanceMenuItem, resolvePerformanceRoute } from '@/lib/performance-management-menu-config';

const titleCase = (value: string) =>
  value
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug = [] } = await params;
  const route = resolvePerformanceRoute(slug.join('/') || 'dashboard');
  const item = findPerformanceMenuItem(route);
  return { title: item?.label || titleCase(route) };
}

export default async function PerformanceManagementSlugPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;

  if (!slug.length) {
    redirect('/hris/performance-management/dashboard');
  }

  const route = resolvePerformanceRoute(slug.join('/'));
  return <PerformanceManagementClient initialRoute={route} initialNow={new Date().toISOString()} />;
}