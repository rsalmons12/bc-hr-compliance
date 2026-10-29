// Supabase connection for the portal.
// Find both values in Supabase: Project Settings -> API (or "Connect" at the top of the dashboard).
// The publishable / anon key is designed to be public; the database security rules protect the data.
// Never put the "secret" or "service_role" key here.
window.PORTAL_CONFIG = {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
};
