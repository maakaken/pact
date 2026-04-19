import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { pact_id, user_id, amount } = await request.json();

    if (!pact_id || !user_id || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify the pact exists
    const { data: pact, error: pactError } = await supabase
      .from('pacts')
      .select('id, name, stake_amount')
      .eq('id', pact_id)
      .single();

    if (pactError || !pact) {
      return NextResponse.json({ error: 'Pact not found' }, { status: 404 });
    }

    // Get or create the current sprint
    const { data: sprint } = await supabase
      .from('sprints')
      .select('id')
      .eq('pact_id', pact_id)
      .order('sprint_number', { ascending: false })
      .limit(1)
      .single();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'inr',
      metadata: {
        pact_id,
        user_id,
        sprint_id: sprint?.id ?? '',
        pact_name: pact.name,
      },
      description: `Pact stake: ${pact.name}`,
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
