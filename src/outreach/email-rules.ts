/** Rules about which addresses we write to. */

/** Shared inboxes (info@, team@, hello@...). Firms with only these often route mail into a helpdesk that auto-closes pitches. */
const GENERIC_INBOX = /^(info|team|hello|hi|hey|contact|contactus|admin|office|enquiries|enquiry|inquiries|inquiry|mail|email|general|sales|studio|coaching|consult|consulting|consultation|consultations|booking|bookings|book|reception|service|services|customerservice|marketing|partners|partnerships|help|ask|getintouch|connect|newsletter|events|training|programs|programmes|clients|client|team\.[a-z]+|us|social|business|operations|ops|projects|communications|comms|letstalk|concierge|enquire|welcome|howdy|admin\.[a-z]+|bonjour|hola)@/i;

/** True for an address that reaches one person (jane@, j.smith@), not a shared inbox. */
export function isPersonalEmail(address: string): boolean {
  return !GENERIC_INBOX.test(address);
}
