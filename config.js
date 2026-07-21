/*
 * Browser-safe configuration for the Herbalife User Admin Portal.
 * Only use the Supabase Project URL and publishable/anon key here.
 * Never place a secret key or service_role key in this file.
 */
window.HERBALIFE_ADMIN_CONFIG = Object.freeze({
  supabaseUrl: "https://plujbfpzsgufpgnwundq.supabase.co",
  supabasePublishableKey: "sb_publishable_35Szjhe6LgMgIfamceRkNQ_g7YgV3tS",
  adminLoginDomain: "herbalife.com",
  userLoginDomain: "herbalife.user",
  edgeFunctionName: "admin-users",
  adminSessionInactivityMinutes: 15,
  minimumUserPasswordLength: 8,
});
