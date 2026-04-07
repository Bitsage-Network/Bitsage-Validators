"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PrivacyPoolRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/wallet");
  }, [router]);

  return null;
}
