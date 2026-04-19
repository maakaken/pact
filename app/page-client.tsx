'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function PageContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle OAuth callback codes that land on the root page
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    const next = searchParams.get('next');

    if (code) {
      // Redirect OAuth codes to the proper callback route
      const callbackUrl = `/auth/callback?code=${code}${state ? `&state=${state}` : ''}`;
      router.replace(callbackUrl);
    } else if (tokenHash && type) {
      // Redirect email confirmation to the proper route
      const confirmUrl = `/auth/confirm?token_hash=${tokenHash}&type=${type}${next ? `&next=${next}` : ''}`;
      router.replace(confirmUrl);
    }
  }, [searchParams, router]);

  return <>{children}</>;
}

export function PageClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PageContent>{children}</PageContent>
    </Suspense>
  );
}
