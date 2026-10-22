// A saved callback contact must never leave the composer hidden behind an
// invisible contact form when another booking CTA opens the same conversation.
export function clinicLeadFormOpen(requested, contactConsent) {
  return Boolean(requested && !contactConsent);
}
