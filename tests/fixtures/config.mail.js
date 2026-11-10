// Test variant: operator details filled in, submissions delivered by the visitor's email app.
import base from '../../site.config.js';

export default {
  ...base,
  siteUrl: 'https://www.example.com',
  operator: {
    legalName: 'Example Studio Ltd.',
    address: '1 Example Street, Example City',
    country: 'Exampleland',
    registrationId: '123456789',
    vatId: 'EX123456789',
    governingLaw: 'Exampleland',
    governingLawHe: 'אקזמפללנד',
    courts: 'Example City, Exampleland',
    courtsHe: 'אקזמפל סיטי',
  },
  contact: {
    email: 'hello@example.com',
    privacyEmail: 'privacy@example.com',
    accessibilityEmail: 'access@example.com',
    securityEmail: 'security@example.com',
    accessibilityName: 'Alex Example',
    phone: '+1 555 0100',
  },
  plans: [
    { id: 'screening', price: 19, checkoutUrl: 'https://checkout.example.com/screening', featured: false },
    { id: 'premiere', price: 49, checkoutUrl: 'https://checkout.example.com/premiere', featured: true },
    { id: 'blockbuster', price: 149, checkoutUrl: '', featured: false, slots: 5 },
  ],
};
