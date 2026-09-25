import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-02-24.acacia' as any,
  typescript: true,
});

export const STRIPE_CONFIG = {
  priceId: process.env.STRIPE_PRICE_ID || 'price_1UFaloBMqkVPUWioDTWXIPv6',
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  monthlyInvoicesLimit: 200,
};
