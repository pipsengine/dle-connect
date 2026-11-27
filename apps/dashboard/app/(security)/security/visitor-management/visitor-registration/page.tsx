"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VisitorRegistrationPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/security/visitor-management/dashboard?register=1");
  }, [router]);
  return null;
}
