import { auth } from '@/lib/auth';

// Authorizes a request for automated (cron) pipeline calls as well as
// normal logged-in browser sessions.
//
// Cron calls carry an `x-cron-secret` header matching CRON_SECRET. This lets
// the daily article pipeline call these routes server-to-server without a
// NextAuth session cookie, while leaving normal dashboard usage unchanged.
export async function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get('x-cron-secret');

  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return true;
  }

  const session = await auth();
  return Boolean(session && session.user);
}
