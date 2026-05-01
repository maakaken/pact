'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { hasCacheConsent, setCacheConsent, hasConsentDecision } from '@/lib/cache';

export default function ConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Show banner only if user hasn't made any consent decision and hasn't dismissed it
    const hasDecision = hasConsentDecision();
    if (!hasDecision && !isDismissed) {
      setIsVisible(true);
    }
  }, [isDismissed]);

  if (!isVisible) return null;

  const handleAccept = () => {
    setCacheConsent(true);
    setIsVisible(false);
    setIsDismissed(true);
  };

  const handleReject = () => {
    setCacheConsent(false);
    setIsVisible(false);
    setIsDismissed(true);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#1B1F1A] text-white p-4 z-50 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm">
            <span className="font-semibold">Faster Loading:</span> Enable local caching to reduce loading times? Your data will be stored in your browser for this session only.
          </p>
        </div>
        <button
          onClick={handleReject}
          className="p-1 hover:bg-[#2D3748] rounded transition-colors"
          aria-label="Close consent banner"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2 max-w-4xl mx-auto mt-3">
        <button
          onClick={handleAccept}
          className="bg-[#2D6A4F] hover:bg-[#1B5E20] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          Enable Caching
        </button>
        <button
          onClick={handleReject}
          className="bg-[#E5E7EB] hover:bg-[#D1D5DB] text-[#374151] px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          No Thanks
        </button>
      </div>
    </div>
  );
}
