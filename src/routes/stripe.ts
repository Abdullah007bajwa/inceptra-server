import Stripe from "stripe";
import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { requireAuth } from "../middleware/clerkAuth.js";

import { prisma } from "../utils/db.js";

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

// ✅ CREATE CHECKOUT SESSION (Premium Upgrade)
router.post(
  "/create-checkout-session",
  requireAuth,
  async (req: Request, res: Response) => {
    const priceId = "price_XXXXX"; // ✅ Replace with actual Stripe Price ID

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: req.body.email,
        success_url: `${process.env.CLIENT_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard?canceled=true`,
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      console.error("❌ Stripe Checkout Session Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ✅ STRIPE WEBHOOK (Sync Subscription Status)
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }), // Must be raw
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("❌ Webhook Signature Verification Failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle Completed Subscription Checkout
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerEmail = session.customer_email!;
      const subscriptionId = session.subscription as string;

      try {
        const user = await prisma.user.findUnique({
          where: { email: customerEmail },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeId: subscriptionId,
              isPremium: true,
            },
          });
        } else {
          console.warn(`⚠️ No user found for email: ${customerEmail}`);
        }
      } catch (err: any) {
        console.error("❌ Failed to update user after checkout:", err.message);
      }
    }

    // ✅ Handle Subscription Canceled
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      try {
        const user = await prisma.user.findFirst({
          where: { stripeId: subscription.id },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isPremium: false,
              stripeId: null,
            },
          });
        }
      } catch (err: any) {
        console.error("❌ Failed to update user on subscription cancel:", err.message);
      }
    }

    // Return a 200 to acknowledge receipt
    res.json({ received: true });
  }
);

export default router;
