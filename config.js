// Supabase connection for the portal.
// Find both values in Supabase: Project Settings -> API (or "Connect" at the top of the dashboard).
// The publishable / anon key is designed to be public; the database security rules protect the data.
// Never put the "secret" or "service_role" key here.
window.PORTAL_CONFIG = {
  supabaseUrl: 'https://cahuepwfuexekhbrjxbz.supabase.co',
  supabaseKey: 'sb_publishable_kXQXAHO_qg6DUAQqa5vu0Q_esfzVxYk',
  // Name of the Edge Function that creates logins (supabase/functions/invite-user).
  inviteFunction: 'rapid-service',
};
