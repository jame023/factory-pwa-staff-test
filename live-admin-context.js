import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.186';
import { getMachineAdminSession, loginToMachineAdmin } from './machine-admin-auth.js?v=1.3.210';
import { createSupabaseEmployeeRepository } from './supabase-employee-repository.js?v=1.3.186';

export async function getLiveAdminContext() {
  const session = await getMachineAdminSession();
  if (!session) return { session: null, repository: null };
  if (session.user?.role !== 'admin' || session.user?.active === false) {
    const error = new Error('ไม่มีสิทธิ์ดำเนินการ');
    error.code = 'PERMISSION_DENIED';
    error.status = 403;
    throw error;
  }
  return {
    session,
    repository: createSupabaseEmployeeRepository({
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      accessToken: session.accessToken,
      user: session.user,
    }),
  };
}

export { loginToMachineAdmin };
