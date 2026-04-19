import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase/server';

// CRITICAL: Must use raw body for Stripe signature verification
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { pact_id, user_id, sprint_id } = paymentIntent.metadata;

    if (!pact_id || !user_id) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Create pact member
    const { error: memberError } = await supabase.from('pact_members').upsert({
      pact_id,
      user_id,
      role: 'member',
      status: 'active',
    }, { onConflict: 'pact_id,user_id' });

    if (memberError) {
      console.error('Error creating pact member:', memberError);
    }

    // Get pact details for stake amount
    const { data: pact } = await supabase.from('pacts').select('stake_amount').eq('id', pact_id).single();

    // Create stake record
    await supabase.from('stakes').insert({
      pact_id,
      sprint_id: sprint_id || null,
      user_id,
      amount: pact?.stake_amount ?? paymentIntent.amount / 100,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'locked',
    });

    // BUG FIX: was .or(email.eq.${user_id}) which compared email to a UUID — never matched.
    // Now: look up the user actual email via auth admin, then match the invitation correctly.
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user_id);
    if (authUser?.email) {
      await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('pact_id', pact_id)
        .eq('email', authUser.email)
        .eq('status', 'pending');
    }

    // Notify pact admin
    const { data: admin } = await supabase
      .from('pact_members')
      .select('user_id')
      .eq('pact_id', pact_id)
      .eq('role', 'admin')
      .single();

    if (admin) {
      const { data: newMember } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user_id)
        .single();

      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'application_approved',
        title: 'New member joined your Pact',
        body: `${newMember?.full_name ?? newMember?.username ?? 'Someone'} has paid their stake and joined the pact.`,
        pact_id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
