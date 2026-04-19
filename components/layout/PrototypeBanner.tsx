export default function PrototypeBanner() {
  return (
    <div className="w-full bg-[#FEF3E2] border-b border-[#F4A261]/30 py-2 px-4 text-center z-50">
      <p className="text-xs text-[#B5540A] font-medium">
        🧪 Prototype — No real money used. Stripe test card:{' '}
        <code className="font-mono bg-[#FEF3E2] px-1">4242 4242 4242 4242</code>
        {' '}| Any future date | Any CVC
      </p>
    </div>
  );
}
