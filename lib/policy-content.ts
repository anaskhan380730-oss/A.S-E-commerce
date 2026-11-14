export const defaultPolicies = {
  shippingPolicy: `Shipping & delivery

  Retail orders within Pakistan: estimated delivery is 4–6 days after order confirmation.

  Wholesale orders within Pakistan: estimated delivery is 12–15 days after order confirmation. Wholesale orders need extra preparation time.

  These are estimates, not guaranteed delivery dates. Timing can vary by city, courier operations, public holidays, weather, or other delays.

Cash on Delivery is currently available for eligible Pakistan addresses. Our team may contact you to confirm order and delivery details before dispatch.

International delivery is available only when enabled by the store, and only for the countries shown at checkout. Any delivery fee and estimate are shown before an order is placed. International orders require card payment; Cash on Delivery is only available for eligible Pakistan orders. A USD price display by itself does not mean international delivery is available.`,
  returnsPolicy: `Returns & exchanges

If your item is damaged, incorrect, or you have another order issue, contact AS Collection through the Contact page or WhatsApp as soon as possible. Share your order reference and clear photos where relevant.

Please do not send an item back until our team has reviewed the request and confirmed the next steps. Return or exchange eligibility, return delivery arrangements, and any refund method are confirmed with you during that review. Custom-stitched items are reviewed against the measurements and details agreed for the order.`,
  privacyPolicy: `Privacy

When you create an account, we store your name, email, optional phone and delivery details, and a securely hashed password so you can sign in and review your orders. We never store your password in readable form. Password-reset links are sent by email when the reset service is configured. Account and order information is kept for account and order support; contact us through the Contact page for a privacy request. When you place an order, we collect the delivery and order details needed to confirm, deliver, and support it. Cash on Delivery is currently used; this website does not ask you to enter or store card details.

If a courier is used, the delivery details needed to deliver your parcel may be shared with that courier. Contact AS Collection through the Contact page for privacy questions or requests.`,
  termsPolicy: `Terms of service

Please provide accurate contact and delivery details so we can confirm and deliver your order. Orders are subject to product, colour, size, and stock availability. Our team may contact you to verify details before dispatch.

Cash on Delivery is currently available for eligible Pakistan orders. The final product price, any discount, and delivery charge are shown at checkout before you place an order. Retail delivery is estimated at 4–6 days; wholesale delivery is estimated at 12–15 days after order confirmation. Wholesale orders must meet the minimum quantity shown on the wholesale page, and wholesale delivery is charged separately.

International orders can be placed only when delivery to the selected country is enabled at checkout and an approved card payment method is available. The delivery fee and estimate are shown before the order is submitted. Cash on Delivery is only available for eligible Pakistan orders.`,
} as const;

export const policyPages = {
  shipping: { title: 'Shipping & delivery', field: 'shippingPolicy' },
  returns: { title: 'Returns & exchanges', field: 'returnsPolicy' },
  privacy: { title: 'Privacy', field: 'privacyPolicy' },
  terms: { title: 'Terms of service', field: 'termsPolicy' },
} as const;

export type PolicyField = keyof typeof defaultPolicies;

const removedCheckoutFollowUpPolicy = `If you actively choose WhatsApp or email follow-up for an unfinished checkout, we save your name, the contact method(s) you selected, delivery details you entered, and a short basket summary for that purpose. No follow-up message is sent automatically. Unfinished-checkout records expire after 30 days. You can contact us to ask us not to follow up.`;

const previousShippingPolicy = `Shipping & delivery

Pakistan orders: estimated delivery is 12–15 days after order confirmation. This is an estimate, not a guaranteed delivery date. Timing can vary by city, courier operations, public holidays, weather, or other delays.

Cash on Delivery is currently available for eligible Pakistan addresses. Our team may contact you to confirm order and delivery details before dispatch.

International orders are not open yet. USD prices, if shown, are for reference only and do not mean that international checkout, payment, or shipping is available. We will update this policy with eligible countries, charges, and delivery estimates after the required payment and courier arrangements are ready.`;

const previousTermsPolicy = `Terms of service

Please provide accurate contact and delivery details so we can confirm and deliver your order. Orders are subject to product, colour, size, and stock availability. Our team may contact you to verify details before dispatch.

Cash on Delivery is currently available for eligible Pakistan orders. The final product price, any discount, and delivery charge are shown at checkout before you place an order. Wholesale orders must meet the minimum quantity shown on the wholesale page, and wholesale delivery is charged separately.

International orders are not available at this time, even if a product price is displayed in USD.`;

export function policyContent(field: PolicyField, saved: string | null | undefined) {
  if (!saved || (field === 'shippingPolicy' && saved === previousShippingPolicy) || (field === 'termsPolicy' && saved === previousTermsPolicy)) {
    return defaultPolicies[field];
  }
  return field === 'privacyPolicy' ? saved.replace(removedCheckoutFollowUpPolicy, '').replace(/\n{3,}/g, '\n\n').trim() : saved;
}
